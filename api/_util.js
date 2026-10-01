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
function makeLimiter(limit) {
  const hits = new Map();
  return (ip) => {
    const now = Date.now();
    const list = (hits.get(ip) || []).filter((t) => now - t < 60000);
    list.push(now);
    hits.set(ip, list);
    if (hits.size > 5000) for (const [k, v] of hits) if (!v.some((t) => now - t < 60000)) hits.delete(k);
    return list.length > limit;
  };
}

const readBody = (req) => (typeof req.body === 'string' ? (() => { try { return JSON.parse(req.body); } catch { return {}; } })() : req.body || {});

module.exports = { safeEqual, clientIp, makeLimiter, readBody };
