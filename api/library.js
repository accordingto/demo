// POST /api/library — 雲端文章庫（主持人專用，需存取碼）
// action: status | list | get | save | delete
const crypto = require('crypto');
const store = require('./_store');
const { safeEqual, clientIp, makeLimiter, readBody } = require('./_util');

const limited = makeLimiter(60);
const MAX_ITEMS = 500;
const ID_RE = /^[A-Za-z0-9_-]{6,32}$/;

const str = (x, n) => String(x ?? '').slice(0, n);
const list = (a, max, n) => (Array.isArray(a) ? a.filter((x) => typeof x === 'string').slice(0, max).map((x) => x.slice(0, n)) : []);

function cleanArticle(a) {
  if (!a || typeof a.title !== 'string' || typeof a.body !== 'string') throw new Error('Invalid article');
  const body = a.body.replace(/\r/g, '');
  if (!body.trim()) throw new Error('The article text is empty');
  if (body.length > 120000) throw new Error('Article is too large to save');   // 不悄悄截斷，直接拒絕
  return {
    title: str(a.title, 200).trim() || 'Untitled',
    body,
    level: str(a.level, 4),
    source: a.source === 'pasted' ? 'pasted' : '',
    wordCount: Math.max(0, Math.min(20000, Number(a.wordCount) || 0)),
    targetWords: Math.max(0, Math.min(20000, Number(a.targetWords) || 0)),
    questions: list(a.questions, 5, 500),
    discussion: list(a.discussion, 5, 500),
  };
}
const cleanVocab = (v) => (Array.isArray(v) ? v : []).slice(0, 300).map((x) => ({
  word: str(x?.word, 40), pos: str(x?.pos, 20), definition: str(x?.definition, 300), zh: str(x?.zh, 60), kk: str(x?.kk, 80), lemma: str(x?.lemma, 40),
})).filter((x) => x.word);

const summary = (it) => ({
  id: it.id, title: it.article.title, level: it.article.level, source: it.article.source,
  wordCount: it.article.wordCount, vocabCount: (it.vocab || []).length, updatedAt: it.updatedAt,
});

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return res.status(405).json({ error: 'POST only' }); }
  const b = readBody(req);

  // 用來判斷前端要用雲端還是本機文章庫（不需存取碼）
  if (b.action === 'status') return res.status(200).json({ configured: store.configured() });

  // 檢查雲端設定（需存取碼）：只回報「找到哪些相關變數的名稱」與連線測試結果，不回傳任何值或 token
  if (b.action === 'diagnose') {
    if (!(process.env.HOST_CODE || '').trim() || !safeEqual(b.code ?? '', process.env.HOST_CODE)) return res.status(401).json({ error: 'Incorrect access code' });
    const names = Object.keys(process.env).filter((k) => /KV_|UPSTASH|REDIS|REST_API/i.test(k)).sort();
    const c = store.conf();
    const out = { configured: store.configured(), relatedVariables: names, usingUrlVariable: c.urlKey || null, usingTokenVariable: c.tokenKey || null, urlHost: null, ping: null };
    if (c.url) { try { out.urlHost = new URL(c.url).host; } catch { out.urlHost = '(invalid URL)'; } }
    if (store.configured()) { try { out.ping = await store.cmd('PING'); } catch (e) { out.ping = `failed: ${e.message}`; } }
    return res.status(200).json(out);
  }

  if (!store.configured()) return res.status(503).json({ error: 'Cloud storage is not configured', configured: false });
  if (!(process.env.HOST_CODE || '').trim()) return res.status(500).json({ error: 'Server is missing HOST_CODE' });
  if (limited(clientIp(req))) return res.status(429).json({ error: 'Too many requests. Please try again in a minute.' });
  if (!safeEqual(b.code ?? '', process.env.HOST_CODE)) return res.status(401).json({ error: 'Incorrect access code' });

  try {
    switch (b.action) {
      case 'list': {
        const ids = await store.cmd('ZREVRANGE', store.INDEX, 0, MAX_ITEMS - 1);
        if (!ids.length) return res.status(200).json({ items: [] });
        const raws = await store.cmd('MGET', ...ids.map(store.KEY));
        const items = raws.map((r) => { try { return r ? summary(JSON.parse(r)) : null; } catch { return null; } }).filter(Boolean);
        return res.status(200).json({ items });
      }
      case 'get': {
        if (!ID_RE.test(String(b.id))) return res.status(400).json({ error: 'Invalid id' });
        const raw = await store.cmd('GET', store.KEY(b.id));
        if (!raw) return res.status(404).json({ error: 'Article not found' });
        const it = JSON.parse(raw);
        return res.status(200).json({ id: it.id, article: it.article, vocab: it.vocab || [], updatedAt: it.updatedAt });
      }
      case 'save': {
        const article = cleanArticle(b.article);
        const vocab = cleanVocab(b.vocab);
        const now = Date.now();
        let id = b.id && ID_RE.test(String(b.id)) ? String(b.id) : '';
        let createdAt = now;
        if (id) { // 更新既有文章（保留建立時間）
          const old = await store.cmd('GET', store.KEY(id));
          if (!old) id = ''; // 已被刪除 → 當成新文章
          else { try { createdAt = JSON.parse(old).createdAt || now; } catch { /* 忽略 */ } }
        }
        if (!id) {
          if ((await store.cmd('ZCARD', store.INDEX)) >= MAX_ITEMS) return res.status(400).json({ error: `Library is full (${MAX_ITEMS} articles). Delete some first.` });
          id = crypto.randomBytes(9).toString('base64url'); // 12 個字元，猜不到
        }
        const item = { id, createdAt, updatedAt: now, article, vocab };
        const json = JSON.stringify(item);
        if (json.length > 250000) return res.status(413).json({ error: 'Article is too large to save' });
        await store.pipeline([['SET', store.KEY(id), json], ['ZADD', store.INDEX, now, id]]);
        return res.status(200).json({ id, updatedAt: now });
      }
      case 'delete': {
        if (!ID_RE.test(String(b.id))) return res.status(400).json({ error: 'Invalid id' });
        await store.pipeline([['DEL', store.KEY(b.id)], ['ZREM', store.INDEX, b.id]]);
        return res.status(200).json({ ok: true });
      }
      default:
        return res.status(400).json({ error: 'Unknown action' });
    }
  } catch (e) {
    const known = { 'Invalid article': 400, 'The article text is empty': 400, 'Article is too large to save': 413 };
    if (known[e.message]) return res.status(known[e.message]).json({ error: e.message });
    return res.status(502).json({ error: 'Cloud storage request failed. Please try again.' });
  }
};
