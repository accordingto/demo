// 安全地抓取使用者提供的網址（防 SSRF）。檔名以底線開頭，不是 API 路由。
// 只允許 http/https、80/443 埠；每次連線（含轉址）都檢查「實際連到的 IP」不是內網、本機、雲端中繼資料位址；限制大小與時間。
const dns = require('dns');
const net = require('net');
const http = require('http');
const https = require('https');
const zlib = require('zlib');

const MAX_BYTES = 2 * 1024 * 1024, TIMEOUT_MS = 10000, MAX_REDIRECTS = 4;
const UA = 'Mozilla/5.0 (compatible; ReadingClubBot/1.0; +article import for personal study)';

class FetchError extends Error {}
let blocked = (ip) => isBlockedIp(ip), anyPort = false;   // 測試用：單元測試會暫時換成「不擋本機」，好用本機伺服器測試抓取流程（只能由程式碼改，沒有環境變數開關）

// 這個 IP 是不是不該連的位址（本機、內網、連結本地、CGNAT、保留、多點傳播…）
function isBlockedIp(ip) {
  if (net.isIPv6(ip)) {
    const l = ip.toLowerCase();
    const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(l);
    if (mapped) return isBlockedIp(mapped[1]);
    return l === '::' || l === '::1' || /^f[cd]/.test(l) || /^fe[89ab]/.test(l) || l.startsWith('ff') || l.startsWith('2001:db8') || l.startsWith('64:ff9b');
  }
  const p = ip.split('.').map(Number);
  if (p.length !== 4 || p.some((x) => !(x >= 0 && x <= 255))) return true;
  const [a, b] = p;
  return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 0) || (a === 192 && b === 168) || (a === 198 && (b === 18 || b === 19)) || a >= 224;
}

// 檢查網址本身：回傳 URL 物件，不合格就丟 FetchError
function checkUrl(raw) {
  let u;
  try { u = new URL(String(raw).trim()); } catch { throw new FetchError('Please enter a valid link (starting with http:// or https://).'); }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new FetchError('Only http:// and https:// links are supported.');
  if (u.username || u.password) throw new FetchError('Links with a user name or password are not supported.');
  const port = u.port || (u.protocol === 'https:' ? '443' : '80');
  if (!anyPort && port !== '80' && port !== '443') throw new FetchError('Only standard web ports (80 and 443) are supported.');
  const host = u.hostname.replace(/^\[|\]$/g, '');
  if (!net.isIP(host) && (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal') || !host.includes('.'))) throw new FetchError('This address cannot be fetched.');
  if (net.isIP(host) && blocked(host)) throw new FetchError('This address cannot be fetched.');
  return u;
}

// 自訂 DNS 解析：連線時才檢查實際的 IP（避免 DNS rebinding）
function safeLookup(hostname, options, cb) {
  dns.lookup(hostname, { all: true, verbatim: true }, (err, addrs) => {
    if (err) return cb(err);
    if (!addrs.length || addrs.some((a) => blocked(a.address))) return cb(new FetchError('This address cannot be fetched.'));
    const a = addrs[0];
    if (options && options.all) return cb(null, [a]);
    cb(null, a.address, a.family);
  });
}

function once(u) {
  return new Promise((resolve, reject) => {
    const lib = u.protocol === 'https:' ? https : http;
    const req = lib.request(u, { method: 'GET', lookup: safeLookup, timeout: TIMEOUT_MS, headers: { 'User-Agent': UA, Accept: 'text/html,application/xhtml+xml;q=0.9,text/plain;q=0.5', 'Accept-Language': 'en,*;q=0.5', 'Accept-Encoding': 'gzip, deflate, br' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) { res.resume(); return resolve({ redirect: new URL(res.headers.location, u).href }); }
      if (res.statusCode !== 200) { res.resume(); return reject(new FetchError(res.statusCode === 404 ? 'The page was not found (404).' : res.statusCode === 401 || res.statusCode === 403 ? 'The site did not allow access to this page (login or bot protection).' : `The site answered with an error (${res.statusCode}).`)); }
      const type = String(res.headers['content-type'] || '');
      if (!/text\/html|application\/xhtml|text\/plain/i.test(type)) { res.resume(); return reject(new FetchError('This link is not a web page (it looks like a file or an image).')); }
      const enc = String(res.headers['content-encoding'] || '').toLowerCase();
      const stream = enc === 'gzip' ? res.pipe(zlib.createGunzip()) : enc === 'deflate' ? res.pipe(zlib.createInflate()) : enc === 'br' ? res.pipe(zlib.createBrotliDecompress()) : res;
      const chunks = []; let size = 0;
      stream.on('data', (c) => { size += c.length; if (size > MAX_BYTES) { req.destroy(new FetchError('The page is too large (over 2 MB).')); } else chunks.push(c); });
      stream.on('end', () => {
        const buf = Buffer.concat(chunks);
        let charset = (/charset=([\w-]+)/i.exec(type) || /<meta[^>]+charset=["']?([\w-]+)/i.exec(buf.slice(0, 4096).toString('latin1')) || [])[1] || 'utf-8';
        let html; try { html = new TextDecoder(charset).decode(buf); } catch { html = buf.toString('utf8'); }
        resolve({ html, type });
      });
      stream.on('error', () => reject(new FetchError('Could not read the page.')));
    });
    req.on('timeout', () => req.destroy(new FetchError('The site took too long to respond.')));
    req.on('error', (e) => reject(e instanceof FetchError ? e : new FetchError(e.code === 'ENOTFOUND' ? 'This address could not be found.' : 'Could not reach the site.')));
    req.end();
  });
}

// 抓取網頁文字（最多跟著轉址 4 次，每一次都重新檢查）
async function fetchPage(raw) {
  let u = checkUrl(raw);
  for (let i = 0; i <= MAX_REDIRECTS; i++) {
    const r = await once(u);
    if (r.html !== undefined) return { html: r.html, url: u.href };
    u = checkUrl(r.redirect);
  }
  throw new FetchError('The link redirects too many times.');
}

// __test.allowLocal：只放行本機回圈位址與任意埠（單元測試用），其他內網位址仍然擋
module.exports = { fetchPage, checkUrl, isBlockedIp, FetchError, __test: { allowLocal(on) { blocked = on ? (ip) => ip !== '127.0.0.1' && ip !== '::1' && isBlockedIp(ip) : (ip) => isBlockedIp(ip); anyPort = on; } } };
