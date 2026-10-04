// 主持人頁與閱讀頁共用的小工具（需最先載入）
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// 窄螢幕（手機、平板直放）：單字表排在文章下面，改用浮動單字卡；與 shared.css 的 1100px 斷點一致
const narrowQuery = window.matchMedia('(max-width:1099px)');

// POST JSON；回應不是 2xx 時丟出 Error（訊息取自後端的 { error }）
async function postJson(url, body, fallback = 'Request failed') {
  const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `${fallback} (${r.status})`);
  return j;
}

// 理解題／討論題的 HTML（兩頁共用）
function questionsHtml(questions, discussion) {
  const ol = (title, arr) => arr.length ? `<section><h3>${title}</h3><ol>${arr.map((x) => `<li>${esc(x)}</li>`).join('')}</ol></section>` : '';
  return ol('Comprehension questions', questions) + ol('Discussion questions', discussion);
}

// 文章資訊列：「Level B1 ・ 300 words ・ ~2 min read」
const readMinutes = (words) => Math.max(1, Math.round(words / 200));

// ---- 舊式分享連結：JSON → UTF-8 → deflate-raw 壓縮 → base64url，放在網址 # 後面（'z.' 壓縮；'b.' 不支援壓縮時的純 base64）----
const b64url = (bytes) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
async function encodeShare(obj) {
  const raw = new TextEncoder().encode(JSON.stringify(obj));
  if (typeof CompressionStream === 'undefined') return 'b.' + b64url(raw);
  const stream = new Blob([raw]).stream().pipeThrough(new CompressionStream('deflate-raw'));
  return 'z.' + b64url(new Uint8Array(await new Response(stream).arrayBuffer()));
}
async function decodeShare(hash) {
  const kind = hash.slice(0, 2);
  const bin = atob(hash.slice(2).replace(/-/g, '+').replace(/_/g, '/'));
  let bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  if (kind === 'z.') {
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    bytes = new Uint8Array(await new Response(stream).arrayBuffer());
  } else if (kind !== 'b.') throw new Error('bad');
  return JSON.parse(new TextDecoder().decode(bytes));
}
