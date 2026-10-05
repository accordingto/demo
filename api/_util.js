// 共用小工具（檔名以底線開頭，Vercel 不會把它當成 API 路由）
const crypto = require('crypto');

// 以雜湊後再比較，避免長度與時間差洩漏資訊
function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

const clientIp = (req) => String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown').split(',')[0].trim();

// 簡易限流：每 IP 每分鐘 limit 次。存在記憶體，serverless 多實例/冷啟動時不共享，只是簡易防護。
// limiter(ip) 記一次並回傳是否超過；limiter(ip, false) 只查看目前是否已達上限（不記次數）
function makeLimiter(limit) {
  const hits = new Map();
  return (ip, count = true) => {
    const now = Date.now();
    const list = (hits.get(ip) || []).filter((t) => now - t < 60000);
    if (count) list.push(now);
    hits.set(ip, list);
    if (hits.size > 5000) for (const [k, v] of hits) if (!v.some((t) => now - t < 60000)) hits.delete(k);
    return count ? list.length > limit : list.length >= limit;
  };
}

const safeJson = (s) => { try { return JSON.parse(s); } catch { return {}; } };
const readBody = (req) => (typeof req.body === 'string' ? safeJson(req.body) : req.body || {});

// 轉成字串、去頭尾空白並限制長度
const clip = (x, n) => String(x ?? '').trim().slice(0, n);

// 文章 id：URL-safe，6～32 字元
const ID_RE = /^[A-Za-z0-9_-]{6,32}$/;

// 只回報缺少的環境變數「名稱」，不洩漏值
const missingEnv = (names) => names.filter((k) => !(process.env[k] || '').trim());

// ---- 使用者與存取碼 ----
// HOST_CODE = 擁有者（只有擁有者能用 AI 產生文章，舊文章也歸他）；USER_CODES = "名稱:存取碼,名稱:存取碼" 其他使用者（各有自己的文章庫）
const OWNER = 'owner';
function listUsers() {
  const users = [];
  const owner = (process.env.HOST_CODE || '').trim();
  if (owner) users.push({ name: OWNER, code: owner, owner: true });
  const extra = [];
  for (const part of String(process.env.USER_CODES || '').split(',')) {
    const i = part.indexOf(':'), name = part.slice(0, i).trim().toLowerCase(), code = part.slice(i + 1).trim();
    if (i > 0 && /^[a-z0-9_-]{1,20}$/.test(name) && name !== OWNER && code && !extra.some((x) => x.name === name)) extra.push({ name, code, owner: false });
  }
  // 存取碼必須各不相同：和擁有者相同，或兩位使用者相同的，一律停用（否則會登入成別人，看到別人的文章庫）
  for (const u of extra) if (u.code !== owner && extra.filter((x) => x.code === u.code).length === 1) users.push(u);
  return users;
}

// 驗證存取碼（所有需要存取碼的端點共用）。通過回傳使用者 { name, owner }；否則已經回應錯誤，回傳 null，呼叫端直接 return。
// ownerOnly：只有擁有者可以（例如 AI 產生文章）。
// 猜錯的次數另外限流（每 IP 每分鐘 10 次，超過就連正確的碼也先擋住），避免有人暴力猜存取碼；已被擋住的 IP 連比對都不做
const authFails = makeLimiter(10);
function checkHostCode(req, res, code, { ownerOnly = false } = {}) {
  const users = listUsers();
  if (!users.length) { res.status(500).json({ error: 'Server is missing HOST_CODE' }); return null; }
  const ip = clientIp(req);
  if (authFails(ip, false)) { res.status(429).json({ error: 'Too many incorrect attempts. Please wait a minute.' }); return null; }
  let found = null;
  for (const u of users) if (safeEqual(code ?? '', u.code) && !found) found = u;   // 每個使用者都比對一次，不會因為是誰而提早結束
  if (!found) { authFails(ip); res.status(401).json({ error: 'Incorrect access code' }); return null; }
  if (ownerOnly && !found.owner) { res.status(403).json({ error: 'This feature is only available to the site owner.' }); return null; }
  return { name: found.name, owner: found.owner };
}

module.exports = { safeEqual, checkHostCode, listUsers, OWNER, clientIp, makeLimiter, readBody, clip, ID_RE, missingEnv };
