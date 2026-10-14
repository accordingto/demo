// 全站檢查用的本機伺服器（只給 scripts/audit/*.js 與手動測試用，不會部署）。
// 一個行程裡包含：靜態檔＋ /api/*（和 Vercel 一樣的安全標頭）、記憶體版的假雲端資料庫（Upstash REST 相容）、假的 Groq 回應。
// 不需要任何金鑰、不連外網。用法：node scripts/audit/server.js [port]   → 擁有者存取碼是 OWNER_CODE（見下方）
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const OWNER_CODE = 'audit-owner-code';

// ---- 假的雲端資料庫（只實作網站用到的指令）----
function fakeRedis() {
  const kv = new Map(), z = new Map(), h = new Map();
  const zs = (k) => z.get(k) || z.set(k, new Map()).get(k), hs = (k) => h.get(k) || h.set(k, new Map()).get(k);
  const run = ([op, k, ...a]) => {
    switch (String(op).toUpperCase()) {
      case 'GET': return kv.has(k) ? kv.get(k) : null;
      case 'SET': kv.set(k, a[0]); return 'OK';
      case 'DEL': [k, ...a].forEach((x) => { kv.delete(x); z.delete(x); }); return 1;
      case 'ZADD': zs(k).set(a[1], Number(a[0])); return 1;
      case 'ZREM': return zs(k).delete(a[0]) ? 1 : 0;
      case 'ZCARD': return zs(k).size;
      case 'ZREVRANGE': return [...zs(k)].sort((x, y) => y[1] - x[1]).map((e) => e[0]).slice(Number(a[0]), Number(a[1]) + 1);
      case 'ZRANGE': { const ids = [...zs(k)].sort((x, y) => x[1] - y[1]).map((e) => e[0]); return Number(a[1]) === -1 ? ids.slice(Number(a[0])) : ids.slice(Number(a[0]), Number(a[1]) + 1); }
      case 'MGET': return [k, ...a].map((x) => (kv.has(x) ? kv.get(x) : null));
      case 'HSET': hs(k).set(a[0], a[1]); return 1;
      case 'HGET': return hs(k).has(a[0]) ? hs(k).get(a[0]) : null;
      case 'HDEL': return hs(k).delete(a[0]) ? 1 : 0;
      case 'HGETALL': return [...hs(k)].flat();
      case 'INCR': kv.set(k, (Number(kv.get(k)) || 0) + 1); return kv.get(k);
      case 'DECR': kv.set(k, (Number(kv.get(k)) || 0) - 1); return kv.get(k);
      case 'EXPIRE': return 1;
      case 'PING': return 'PONG';
      default: throw new Error('ERR unknown command ' + op);
    }
  };
  return (url, body) => (url.endsWith('/pipeline') ? body.map((c) => ({ result: run(c) })) : { result: run(body) });
}

// ---- 假的 Groq：AI 產生（串流）與查單字 ----
const ARTICLE = '=== TITLE ===\nA Day at the Market\n=== BODY ===\nI walked to the market and bought some fruit for lunch. It was a sunny day.\n\nThe market was busy, and everyone was friendly.\n=== QUESTIONS ===\n1. Where did the writer go?\n2. What did the writer buy?\n=== DISCUSSION ===\n1. Do you like markets?\n2. Why or why not?';
function fakeFetch(redis) {
  return async (url, opt = {}) => {
    const u = String(url), body = opt.body ? JSON.parse(opt.body) : null;
    if (u.startsWith('http://fake-redis')) { const j = redis(u, body); return { ok: true, status: 200, json: async () => j }; }
    if (u.includes('api.groq.com')) {
      if (body && body.stream) return { ok: true, status: 200, body: (async function* () { yield Buffer.from('data: ' + JSON.stringify({ choices: [{ delta: { content: ARTICLE } }] }) + '\n\ndata: [DONE]\n\n'); })() };
      const w = (() => { try { return JSON.parse(body.messages[1].content).word; } catch { return 'word'; } })();
      return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: JSON.stringify({ lemma: w, pos: 'noun', kk: '[wɝd]', definition: 'meaning of ' + w, zh: '中文' }) } }] }) };
    }
    throw new Error('Network is disabled in the audit server: ' + u);
  };
}

function start(port = 0) {
  Object.assign(process.env, { GROQ_API_KEY: 'x', AI_MODEL: 'audit-model', HOST_CODE: OWNER_CODE, KV_REST_API_URL: 'http://fake-redis', KV_REST_API_TOKEN: 'x' });
  global.fetch = fakeFetch(fakeRedis());
  const routes = {};
  for (const f of fs.readdirSync(path.join(ROOT, 'api'))) if (!f.startsWith('_') && f.endsWith('.js')) routes['/api/' + f.slice(0, -3)] = require(path.join(ROOT, 'api', f));
  const headers = JSON.parse(fs.readFileSync(path.join(ROOT, 'vercel.json'), 'utf8')).headers[0].headers;
  const TYPES = { '.css': 'text/css', '.js': 'text/javascript', '.html': 'text/html', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json' };
  const srv = http.createServer((q, r) => {
    headers.forEach((x) => r.setHeader(x.key, x.value));
    const u = new URL(q.url, 'http://x'), h = routes[u.pathname];
    if (h) {
      let d = ''; q.on('data', (c) => { d += c; });
      q.on('end', () => {
        q.body = d ? JSON.parse(d) : {}; q.query = Object.fromEntries(u.searchParams);
        r.status = (c) => { r.statusCode = c; return r; };
        r.json = (o) => { r.setHeader('Content-Type', 'application/json'); r.end(JSON.stringify(o)); };
        Promise.resolve(h(q, r)).catch((e) => { r.statusCode = 500; r.end(String(e)); });
      });
      return;
    }
    const f = path.normalize(u.pathname.replace(/^\/+/, '') || 'index.html');
    if (f.startsWith('..')) { r.statusCode = 400; return r.end(); }
    try { r.setHeader('Content-Type', (TYPES[path.extname(f)] || 'text/html') + '; charset=utf-8'); r.end(fs.readFileSync(path.join(ROOT, f))); }
    catch { r.statusCode = 404; r.end(); }
  });
  return new Promise((ok) => srv.listen(port, '127.0.0.1', () => ok({ srv, url: `http://127.0.0.1:${srv.address().port}` })));
}

// 準備檢查用的資料：兩位使用者、幾篇文章（含長標題）
async function seed(url) {
  const call = (body) => fetchLocal(url + '/api/library', { code: OWNER_CODE, ...body });
  for (const name of ['pluto', 'anna']) await call({ action: 'users_add', name, password: `${name}-password-123` });
  const titles = ['The three words that saved my life - Blake Mycoskie', 'Why Can’t We Better Prepare for Extreme Weather? - Catherine Nakalembe', 'A Day at the Market'];
  for (const title of titles) await call({ action: 'save', article: { title, body: 'Hello world. '.repeat(60), source: 'pasted', wordCount: 120, questions: [], discussion: [] }, vocab: [{ word: 'world', definition: 'the earth', zh: '世界' }] });
}
function fetchLocal(url, body) {   // 用 node 內建 http（global.fetch 已被換成假的）
  return new Promise((ok, no) => {
    const u = new URL(url), data = JSON.stringify(body);
    const req = http.request({ hostname: u.hostname, port: u.port, path: u.pathname, method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } }, (res) => { let d = ''; res.on('data', (c) => { d += c; }); res.on('end', () => ok(d)); });
    req.on('error', no); req.end(data);
  });
}

module.exports = { start, seed, OWNER_CODE };

if (require.main === module) {
  start(Number(process.argv[2]) || 3141).then(async ({ url }) => { await seed(url); console.log(`Audit server: ${url}  (owner access code: ${OWNER_CODE})`); });
}
