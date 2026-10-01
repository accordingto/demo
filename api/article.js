// GET /api/article?id=XXXX — 公開讀取文章（成員閱讀頁用，不需存取碼）。
// 只回傳文章與主持人挑的單字；文章庫清單與寫入一律要存取碼（見 library.js）。
const store = require('./_store');
const { clientIp, makeLimiter } = require('./_util');

const limited = makeLimiter(120);
const ID_RE = /^[A-Za-z0-9_-]{6,32}$/;

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store'); // 主持人更新後，成員重新整理就能看到新版
  if (req.method !== 'GET') { res.setHeader('Allow', 'GET'); return res.status(405).json({ error: 'GET only' }); }
  if (!store.configured()) return res.status(503).json({ error: 'Cloud storage is not configured' });
  if (limited(clientIp(req))) return res.status(429).json({ error: 'Too many requests. Please try again in a minute.' });
  const id = String(req.query?.id || new URL(req.url, 'http://x').searchParams.get('id') || '');
  if (!ID_RE.test(id)) return res.status(400).json({ error: 'Invalid link' });
  try {
    const raw = await store.cmd('GET', store.KEY(id));
    if (!raw) return res.status(404).json({ error: 'Article not found' });
    const it = JSON.parse(raw);
    return res.status(200).json({ article: it.article, vocab: it.vocab || [], updatedAt: it.updatedAt });
  } catch {
    return res.status(502).json({ error: 'Could not load the article. Please try again.' });
  }
};
