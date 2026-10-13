// POST /api/extract — 貼上網址，自動擷取網頁裡最重要的文章內容（主持人專用，需存取碼）
// body: { code, url } → { title, text, words, truncated, host, via? }
// TED 講者頁（ted.com/talks/…）：直接取頁面公開的逐字稿（api/_ted.js），via = 'TED transcript'。
const { fetchPage, FetchError } = require('./_fetch');
const { extractArticle } = require('./_extract');
const { tedUrl, parseTed } = require('./_ted');

const MAX_WORDS = 8000;
const { checkHostCode, clientIp, makeLimiter, readBody } = require('./_util');

const limited = makeLimiter(10);

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return res.status(405).json({ error: 'POST only' }); }
  const b = readBody(req);
  if (!(await checkHostCode(req, res, b.code))) return;
  if (limited(clientIp(req))) return res.status(429).json({ error: 'Too many requests. Please try again in a minute.' });
  try {
    const ted = tedUrl(b.url);
    const { html, url } = await fetchPage(ted || b.url, ted ? { maxBytes: 6 * 1024 * 1024 } : undefined);   // TED 頁含逐字稿資料，比一般頁面大
    if (ted) {
      const t = parseTed(html);
      if (t) {
        const all = t.text.split(/\s+/).length, truncated = all > MAX_WORDS;
        const text = truncated ? t.text.split(/\s+/).slice(0, MAX_WORDS).join(' ') : t.text;
        return res.status(200).json({ title: t.title, text, words: Math.min(all, MAX_WORDS), truncated, host: 'ted.com', via: 'TED transcript' });
      }
    }
    const a = extractArticle(html);
    if (!a) return res.status(422).json({ error: ted ? 'Could not find the transcript on this TED page. On the TED page, open “Read transcript”, copy the text and use “Paste text” instead.' : 'Could not find the main article text on this page. It may need JavaScript, a login or a subscription — try copying the text and using “Paste text” instead.' });
    return res.status(200).json({ title: a.title, text: a.text, words: a.words, truncated: a.truncated, host: new URL(url).hostname.replace(/^www\./, '') });
  } catch (e) {
    if (e instanceof FetchError) return res.status(400).json({ error: e.message });
    return res.status(502).json({ error: 'Could not read that page. Please try again or paste the text instead.' });
  }
};
