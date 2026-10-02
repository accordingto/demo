// Groq（OpenAI 相容）呼叫的共用部分（檔名以底線開頭，Vercel 不會把它當成 API 路由）
const { modelName, reasoningParams } = require('./_model');

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';

class GroqError extends Error {
  constructor(status, detail) {
    super(`AI service error (${status})`);
    this.status = status;
    this.detail = detail; // Groq 回的錯誤說明（不含金鑰）
  }
}

// 送出 chat completion 請求；非 2xx 時丟出 GroqError。
// 推理型模型會附上「降低思考量」的參數；模型不接受（400）時，不帶該參數重試一次。
async function groqChat(body, signal) {
  const model = modelName();
  const post = (extra) => fetch(GROQ_URL, {
    method: 'POST',
    signal,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.GROQ_API_KEY.trim()}` },
    body: JSON.stringify({ model, ...body, ...extra }),
  });
  const extra = reasoningParams(model);
  let r = await post(extra);
  if (r.status === 400 && Object.keys(extra).length) r = await post({});
  if (!r.ok) {
    const t = await r.text().catch(() => '');
    let detail = ''; try { detail = JSON.parse(t).error?.message || ''; } catch { /* 忽略 */ }
    throw new GroqError(r.status, detail);
  }
  return r;
}

// 讀取串流回應（SSE），每收到內容就呼叫 onDelta(目前累計字數)，回傳 { text, finish }
// finish：'stop' = 正常結束，'length' = 被 token 上限截斷
async function readStream(r, onDelta) {
  const dec = new TextDecoder();
  let buf = '', text = '', finish = '', thinking = 0;
  for await (const chunk of r.body) {
    buf += dec.decode(chunk, { stream: true });
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i).trim();
      buf = buf.slice(i + 1);
      if (!line.startsWith('data:')) continue;
      const payload = line.slice(5).trim();
      if (payload === '[DONE]') continue;
      try {
        const choice = JSON.parse(payload).choices?.[0];
        if (choice?.finish_reason) finish = choice.finish_reason;
        if (choice?.delta?.reasoning) { thinking += choice.delta.reasoning.length; onDelta(text.length + thinking); } // 推理型模型的思考過程：不採用，只用來顯示進度
        if (choice?.delta?.content) { text += choice.delta.content; onDelta(text.length + thinking); }
      } catch { /* 忽略不完整的行 */ }
    }
  }
  return { text, finish };
}

// 把錯誤轉成給使用者看的訊息（逾時 / Groq 錯誤 / 其他）
function errorMessage(e) {
  if (e.name === 'AbortError') return 'The AI took too long to respond.';
  if (e.status === 401) return 'Invalid AI API key. Check GROQ_API_KEY.';
  if (e.status === 429) return 'AI service quota or rate limit reached. Try again later.';
  if (e.status === 404) return `AI model not found. Check AI_MODEL. ${e.detail || ''}`.trim();
  if (e.status && e.detail) return `${e.message}: ${e.detail}`;
  return e.message;
}

module.exports = { groqChat, readStream, errorMessage, GroqError };
