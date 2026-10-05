// POST /api/extract — 貼上網址，自動擷取網頁裡最重要的文章內容（主持人專用，需存取碼）
// body: { code, url } → { title, text, words, truncated, host }
const { fetchPage, FetchError } = require('./_fetch');
const { extractArticle } = require('./_extract');
const { checkHostCode, clientIp, makeLimiter, readBody } = require('./_util');

const limited = makeLimiter(10);

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return res.status(405).json({ error: 'POST only' }); }
  const b = readBody(req);
  if (!(await checkHostCode(req, res, b.code))) return;
  if (limited(clientIp(req))) return res.status(429).json({ error: 'Too many requests. Please try again in a minute.' });
  try {
    const { html, url } = await fetchPage(b.url);
    const a = extractArticle(html);
    if (!a) return res.status(422).json({ error: 'Could not find the main article text on this page. It may need JavaScript, a login or a subscription — try copying the text and using “Paste text” instead.' });
    return res.status(200).json({ title: a.title, text: a.text, words: a.words, truncated: a.truncated, host: new URL(url).hostname.replace(/^www\./, '') });
  } catch (e) {
    if (e instanceof FetchError) return res.status(400).json({ error: e.message });
    return res.status(502).json({ error: 'Could not read that page. Please try again or paste the text instead.' });
  }
};
