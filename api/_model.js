// 模型相關的共用設定（檔名以底線開頭，Vercel 不會把它當成 API 路由）
const modelName = () => String(process.env.AI_MODEL || '').trim().replace(/^["']|["']$/g, '');

// 會先「思考」再回答的推理型模型：思考過程也會消耗 token，額度太小就會在寫出答案前用完
const isReasoning = (m = modelName()) => /gpt-oss|qwen3|deepseek-r1|-r1|reasoning|magistral|thinking/i.test(m);

// 要求推理型模型少想一點（不同模型的參數不同；模型不接受時呼叫端會不帶參數重試）
function reasoningParams(m = modelName()) {
  if (/gpt-oss/i.test(m)) return { reasoning_effort: 'low' };
  if (/qwen3/i.test(m)) return { reasoning_effort: 'none' };
  return {};
}

// 文章的 token 額度：字數 × 2.5 + 2500；推理型模型另加 6000 給思考用
const articleTokens = (words, m = modelName()) => Math.min(isReasoning(m) ? 16000 : 12000, Math.ceil(words * 2.5) + 2500 + (isReasoning(m) ? 6000 : 0));

module.exports = { modelName, isReasoning, reasoningParams, articleTokens };
