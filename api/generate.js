// POST /api/generate — 依條件產生英文閱讀文章（Groq，OpenAI 相容 API，SSE 串流）
// 需要主持人存取碼。回應事件：progress {chars} / result {...文章} / error {error}
const { articleTokens, modelName } = require('./_model');
const { groqChat, readStream, errorMessage } = require('./_groq');
const { validate, buildMessages } = require('./_prompt');
const { parseArticle, countWords } = require('./_parse');
const { safeEqual, clientIp, makeLimiter, readBody, missingEnv } = require('./_util');

const TIMEOUT_MS = 55000; // 需小於 vercel.json 的 maxDuration
const TOLERANCE = 0.1;    // 實際字數與目標差超過 10% 時，前端會提示
const limited = makeLimiter(5);

const send = (res, event, data) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'POST only' });
  }
  const missing = missingEnv(['GROQ_API_KEY', 'AI_MODEL', 'HOST_CODE']);
  if (missing.length) return res.status(500).json({ error: `Server is missing environment variables: ${missing.join(', ')} (redeploy after setting them)` });

  const body = readBody(req);
  if (!safeEqual(body.code ?? '', process.env.HOST_CODE)) return res.status(401).json({ error: 'Incorrect access code' });
  if (limited(clientIp(req))) return res.status(429).json({ error: 'Too many requests. Please try again in a minute.' });

  const { error, value: o } = validate(body);
  if (error) return res.status(400).json({ error });

  // 串流輸出，避免長文在等待期間被視為無回應
  res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive' });

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const r = await groqChat({ messages: buildMessages(o), stream: true, temperature: 0.7, max_tokens: articleTokens(o.words) }, ctrl.signal);
    const { text, finish } = await readStream(r, (n) => send(res, 'progress', { chars: n }));
    const article = parseArticle(text, o, finish);
    const actual = countWords(article.body);
    // 串流時不自動重試（重試需再次完整生成，可能超過函式時限）；超出 ±10% 時附上實際字數供前端提示
    const withinTolerance = Math.abs(actual - o.words) <= o.words * TOLERANCE;
    send(res, 'result', { ...article, level: o.level, targetWords: o.words, wordCount: actual, withinTolerance });
  } catch (e) {
    let msg = e.name === 'AbortError' ? 'Generation timed out. Try a smaller word count.' : errorMessage(e);
    if (/incomplete/.test(msg)) msg += ` [model: ${modelName()}]`; // 方便確認是哪個模型
    send(res, 'error', { error: msg });
  } finally {
    clearTimeout(timer);
    res.end();
  }
};
