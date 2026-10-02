// 主持人頁：設定、產生文章、預覽、分享連結（需先載入 util.js、vocab.js）
let current = null;      // 目前預覽的文章 { title, body, level, source, wordCount, targetWords, withinTolerance, questions, discussion }
let currentLibId = null; // 目前文章在文章庫中的 id（已保存或從文章庫開啟時才有）→ 單字表有變動就自動同步

// ---- 記住設定：存在這台裝置的瀏覽器（localStorage），下次開啟自動帶入 ----
const SAVED = ['code', 'topic', 'words', 'level', 'genre', 'questions', 'discussion'];
function saveSettings() {
  try {
    const o = {};
    SAVED.forEach((id) => { const el = $(id); o[id] = el.type === 'checkbox' ? el.checked : el.value; });
    localStorage.setItem('rc-settings', JSON.stringify(o));
  } catch { /* 無痕模式或被封鎖時略過，不影響使用 */ }
}
function loadSettings() {
  try {
    const o = JSON.parse(localStorage.getItem('rc-settings') || '{}');
    SAVED.forEach((id) => { if (id in o) { const el = $(id); if (el.type === 'checkbox') el.checked = !!o[id]; else el.value = o[id]; } });
  } catch { /* 忽略 */ }
}
loadSettings();
$('form').addEventListener('input', saveSettings);
$('form').addEventListener('change', saveSettings);

// ---- 產生文章：讀取 SSE 串流（progress / result / error）----
async function generate(payload, onProgress) {
  const res = await fetch('/api/generate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  if (!res.ok) { // 驗證階段的錯誤是一般 JSON
    const j = await res.json().catch(() => ({}));
    throw new Error(j.error || `Request failed (${res.status})`);
  }
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = '', result = null;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i;
    while ((i = buf.indexOf('\n\n')) >= 0) {
      const block = buf.slice(0, i); buf = buf.slice(i + 2);
      const ev = /event: (\w+)/.exec(block)?.[1];
      const data = JSON.parse(/data: (.*)/.exec(block)?.[1] || '{}');
      if (ev === 'progress') onProgress(data.chars);
      else if (ev === 'error') throw new Error(data.error);
      else if (ev === 'result') result = data;
    }
  }
  if (!result) throw new Error('Connection lost before the article was complete. Please retry.');
  return result;
}

// 顯示文章（a）與單字表（vocab）。libId：文章在文章庫中的 id（沒有就是 null）
function render(a, vocab = [], libId = null) {
  currentLibId = null; // 先清掉，避免載入單字表時被當成「單字表有變動」而同步
  Vocab.setItems(vocab);
  const meta = `${a.source === 'pasted' ? 'Your text' : `Level ${a.level}`} ・ ${a.wordCount} words${a.source === 'pasted' || !a.targetWords || a.targetWords === a.wordCount ? '' : ` (target ${a.targetWords})`} ・ ~${readMinutes(a.wordCount)} min read`;
  $('doc').innerHTML =
    `<div class="text"><h2>${esc(a.title)}</h2><div class="meta">${meta}</div>` +
    (a.withinTolerance ? '' : '<div class="msg warn">⚠ The word count is more than 10% off the target. Press “Regenerate” to try again.</div>') +
    '<div id="bodyText" style="margin-top:1em"></div></div>';
  Vocab.repaint();
  $('qa').innerHTML = questionsHtml(a.questions, a.discussion);
  $('regen').classList.toggle('hidden', a.source === 'pasted');   // 貼上的文章沒有「重新產生」，改用「Edit」
  $('empty').classList.add('hidden');
  $('preview').classList.remove('hidden');
  ['link', 'copy', 'openReader'].forEach((id) => $(id).classList.add('hidden'));
  $('linkMsg').textContent = '';
  currentLibId = libId;
  markSynced();   // 剛載入／產生的單字表不算「變動」
}
// 開啟一篇已存的文章（雲端或本機文章庫）
function openArticle(article, vocab, libId) {
  current = { ...article, withinTolerance: true };
  render(current, vocab || [], libId);
}

async function run() {
  const payload = {
    code: $('code').value, topic: $('topic').value, words: Number($('words').value), level: $('level').value,
    genre: $('genre').value, questions: $('questions').checked, discussion: $('discussion').checked,
  };
  $('go').disabled = $('regen').disabled = true;
  $('status').className = 'msg'; $('status').textContent = '⏳ Generating…';
  try {
    current = await generate(payload, (n) => { $('status').textContent = `⏳ Generating… (${n} characters received)`; });
    $('status').textContent = '';
    render(current);
    if (narrowQuery.matches) $('preview').scrollIntoView({ behavior: 'smooth' }); // 窄螢幕才需要捲動
  } catch (e) {
    $('status').className = 'msg err'; $('status').textContent = '❌ ' + e.message;
    if (e.message === 'Incorrect access code') { $('code').value = ''; saveSettings(); $('code').focus(); } // 存的是錯誤的碼就清掉
  } finally { $('go').disabled = $('regen').disabled = false; }
}
$('form').addEventListener('submit', (e) => { e.preventDefault(); run(); });
$('regen').addEventListener('click', run);

// ---- 分享連結 ----
// 雲端：短連結 read.html?a=<id>（內容存在雲端，永遠最新版）
const shortLink = (id) => new URL('read.html', location.href).href + '?a=' + encodeURIComponent(id);
// 本機：整篇文章壓縮後放在網址 # 後面，連結本身即可永久開啟
async function buildLink(a, vocab = []) {
  const hv = vocab.filter((x) => !x.loading && !x.failed).map((x) => [x.word, x.definition, x.zh, x.kk || '', x.pos || '', x.lemma || '']); // 主持人挑的單字
  const data = await encodeShare({ v: 1, t: a.title, l: a.level || '', w: a.wordCount, b: a.body, q: a.questions, d: a.discussion, ...(hv.length ? { hv } : {}) });
  return new URL('read.html', location.href).href + '#' + data;
}
function showLink(url) {
  $('link').value = url; $('link').classList.remove('hidden'); $('copy').classList.remove('hidden');
  $('openReader').href = url; $('openReader').classList.remove('hidden');
}
// 複製文字；瀏覽器不允許時改成手動複製。btn：按鈕上短暫顯示 Copied ✓
async function copyText(text, btn, idleLabel) {
  try { await navigator.clipboard.writeText(text); if (btn) btn.textContent = 'Copied ✓'; return true; }
  catch { prompt('Copy the link manually', text); return false; }
  finally { if (btn) setTimeout(() => { btn.textContent = idleLabel; }, 1500); }
}
$('mkLink').addEventListener('click', async () => {
  if (!current) return;
  if (cloud) { // 雲端：存到雲端文章庫並產生短連結
    try {
      const id = currentLibId || await cloudSave(); showLink(shortLink(id));
      $('linkMsg').textContent = '✅ Short share link ready. It works on any device and always shows the latest version (new words you add here update it automatically).';
      refreshCloud();
    } catch (e) { $('linkMsg').textContent = '❌ ' + e.message; }
    return;
  }
  const url = await buildLink(current, Vocab.getItems());
  showLink(url);
  $('linkMsg').textContent = `Link length: ${url.length} characters` + (url.length > 8000 ? ' (long — some messaging apps may truncate it, so test it first)' : '') + '. The link contains the whole article, so keep it and it will open forever.';
});
$('copy').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText($('link').value); $('linkMsg').textContent = '✅ Link copied'; }
  catch { $('link').select(); $('linkMsg').textContent = 'Please copy the link above manually'; }
});
