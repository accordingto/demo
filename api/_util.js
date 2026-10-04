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

// 驗證主持人存取碼（所有需要存取碼的端點共用）。通過回傳 true；否則已經回應錯誤，呼叫端直接 return。
// 猜錯的次數另外限流（每 IP 每分鐘 10 次），避免有人暴力猜存取碼；已被擋住的 IP 連比對都不做
const authFails = makeLimiter(10);
function checkHostCode(req, res, code) {
  if (missingEnv(['HOST_CODE']).length) { res.status(500).json({ error: 'Server is missing HOST_CODE' }); return false; }
  const ip = clientIp(req);
  if (authFails(ip, false)) { res.status(429).json({ error: 'Too many incorrect attempts. Please wait a minute.' }); return false; }
  if (!safeEqual(code ?? '', process.env.HOST_CODE)) { authFails(ip); res.status(401).json({ error: 'Incorrect access code' }); return false; }
  return true;
}

module.exports = { safeEqual, checkHostCode, clientIp, makeLimiter, readBody, clip, ID_RE, missingEnv };
