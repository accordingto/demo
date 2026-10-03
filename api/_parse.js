// 解析 AI 回傳的文章（檔名以底線開頭，Vercel 不會把它當成 API 路由）
// 格式：=== TITLE === / BODY / QUESTIONS / DISCUSSION ===
// 不使用 JSON：長文裡的引號、換行會讓 JSON 容易壞掉，分隔標記則不受影響。
const { paragraphCount } = require('./_prompt');

const countWords = (s) => (s.trim().match(/\S+/g) || []).length;

function parseSections(text) {
  const parts = text.replace(/\r/g, '').split(/^[ \t]*={3,}[ \t]*([A-Za-z ]+?)[ \t]*={3,}[ \t]*$/m);
  const map = {};
  for (let i = 1; i < parts.length; i += 2) map[parts[i].trim().toUpperCase()] = (parts[i + 1] || '').trim();
  return map;
}
const toList = (t) => (t || '').split('\n').filter((l) => !/^\s*```/.test(l)).map((l) => l.replace(/^\s*(?:\d+[.)]|[-*•])\s*/, '').trim()).filter(Boolean);

// 保險：若 AI 仍然一句一段（或段數過多），把句子依字數重新合併成 n 段
function normalizeParagraphs(body, n) {
  const paras = body.split(/\n\s*\n/).map((p) => p.replace(/\s*\n\s*/g, ' ').trim()).filter(Boolean);
  const sentences = body.replace(/\s+/g, ' ').trim().split(/(?<=[.!?]["'”’)]?)\s+/).filter(Boolean);
  const avg = sentences.length / Math.max(1, paras.length);
  const fragmented = paras.length > n + 2 || (paras.length >= 3 && avg < 2.2);
  if (!fragmented || sentences.length < n * 2) return paras.join('\n\n');
  const total = sentences.reduce((a, x) => a + countWords(x), 0);
  const out = []; let cur = []; let cum = 0;
  sentences.forEach((x, i) => {
    cur.push(x); cum += countWords(x);
    const left = sentences.length - 1 - i;
    // 累計字數達到「第 k 段的終點」就切段，讓各段字數接近
    if (out.length < n - 1 && cum >= ((out.length + 1) * total) / n && left >= n - 1 - out.length) { out.push(cur.join(' ')); cur = []; }
  });
  if (cur.length) out.push(cur.join(' '));
  return out.join('\n\n');
}

// 分析師風格：每個「1. 2. 3.」編號是一段（一點一段）。AI 把編號寫在同一段或連續幾行時重新整理；完全沒編號就自動補上
function normalizeNumbered(body) {
  const lines = body.replace(/\r/g, '').split('\n');
  const blocks = []; let cur = null, numbered = 0;
  for (const raw of lines) {
    const l = raw.trim(); if (!l) { cur = null; continue; }
    const m = /^(\d+)[.)]\s+(.*)$/.exec(l);
    if (m) { blocks.push(`${m[1]}. ${m[2]}`); cur = blocks.length - 1; numbered++; }
    else if (cur !== null) blocks[cur] += ' ' + l;               // 同一點的後續行
    else { blocks.push(l); cur = blocks.length - 1; }            // 編號前的開場白
  }
  if (numbered >= 2) return blocks.join('\n\n');
  const paras = normalizeParagraphs(body, 5).split('\n\n').filter(Boolean);   // 沒有編號 → 每段編號
  return paras.map((p, i) => `${i + 1}. ${p.replace(/^\d+[.)]\s+/, '')}`).join('\n\n');
}

// o = validate() 的結果；finish = 串流結束原因（用來說明為什麼沒有文章）
function parseArticle(text, o, finish) {
  const sec = parseSections(text);
  const known = new Set(['TITLE', 'QUESTIONS', 'DISCUSSION', 'BODY']);
  // 容錯：AI 把標記寫成別的名稱（STORY / ARTICLE / TEXT…）時，取最長的那一段當文章
  if (!sec.BODY) {
    const other = Object.entries(sec).filter(([k]) => !known.has(k)).sort((a, b) => b[1].length - a[1].length)[0];
    if (other && other[1].length > 150) sec.BODY = other[1];
  }
  // AI 完全沒用標記時，把整段文字當成文章（總比失敗好）
  if (!sec.BODY && !Object.keys(sec).length && text.trim().length > 200) sec.BODY = text;
  const body = (sec.BODY || '').replace(/^```\w*\n?|\n?```\s*$/g, '').trim();
  if (!body) {
    // 把原因直接告訴使用者：被截斷、空白，或 AI 回了別的內容
    const why = finish === 'length' ? ' The output hit the token limit before the article was written (a reasoning model can spend its tokens on thinking). Try fewer words or a non-reasoning model.'
      : !text.trim() ? ' The AI returned an empty response.'
      : ` The AI replied: “${text.trim().replace(/\s+/g, ' ').slice(0, 160)}”`;
    throw new Error('The AI response was incomplete (no article text).' + why);
  }
  const title = (sec.TITLE || '').split('\n')[0].replace(/^["'“”#*\s]+|["'“”*\s]+$/g, '') || 'Untitled';
  return {
    title,
    body: o.genre === 'analysis' ? normalizeNumbered(body) : normalizeParagraphs(body, paragraphCount(o.words)),
    questions: o.questions ? toList(sec.QUESTIONS).slice(0, 2) : [],   // 各只保留 2 題
    discussion: o.discussion ? toList(sec.DISCUSSION).slice(0, 2) : [],
  };
}

module.exports = { parseArticle, normalizeParagraphs, normalizeNumbered, parseSections, toList, countWords };
