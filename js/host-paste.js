// 主持人頁：貼上自己的文章
// 文字整理（normalizePasted、toLines、countWordsIn）在 paste-text.js

const PASTE_KEY = 'rc-paste-draft';
const PF = { t: 'pasteTitle', b: 'pasteBody', q: 'pasteQ', d: 'pasteD', m: 'pasteMode' };   // 草稿欄位 → 輸入框 id
const PASTE_NOTE = 'Pasted text is not sent to the AI and needs no access code. Importing from a link does need the access code (left menu). You can look up words, save it to your library and share it just like a generated article. URLs in the text become clickable links.';

function savePasteDraft() { try { localStorage.setItem(PASTE_KEY, JSON.stringify(Object.fromEntries(Object.entries(PF).map(([k, id]) => [k, $(id).value])))); } catch { /* 忽略 */ } }
const HOW = { blank: 'blank lines', lines: 'each line break', joined: 'line breaks joined (hard-wrapped text)' };
const pasteResult = () => normalizePasted($('pasteBody').value, $('pasteMode').value);
const paraCount = (text) => text ? text.split('\n\n').length : 0;
const MODE_NAME = { lines: 'every line break', blank: 'blank lines only' };
function updatePasteInfo() {   // 字數與目前會得到的段落數（自動模式也顯示判斷結果；手動模式要看得出來）
  const { text, how } = pasteResult(), mode = $('pasteMode').value;
  $('pasteInfo').textContent = `${countWordsIn(text)} words · ${paraCount(text)} paragraph${paraCount(text) === 1 ? '' : 's'}${mode === 'auto' ? (text ? ` (auto: ${HOW[how]})` : '') : ` (manual: ${MODE_NAME[mode]})`}`;
  const d = $('pasteMode').closest('details'); if (mode !== 'auto' && d) d.open = true;   // 不是自動模式就把「More options」打開，才看得到
}
function fillPaste(o) { Object.entries(PF).forEach(([k, id]) => { $(id).value = o[k] || (k === 'm' ? 'auto' : ''); }); updatePasteInfo(); }
function loadDraft() { let d = {}; try { d = JSON.parse(localStorage.getItem(PASTE_KEY) || '{}') || {}; } catch { /* 忽略 */ } fillPaste(d); }
function setPasteMsg(t, err) { $('pasteMsg').className = err ? 'msg err' : 'meta'; $('pasteMsg').textContent = t; }

// 切到 Create 的「貼上文字」分頁

$('pasteClear').addEventListener('click', () => { fillPaste({}); $('pasteUrl').value = ''; savePasteDraft(); $('pasteBody').focus(); });
Object.values(PF).forEach((id) => $(id).addEventListener('input', () => { if (id === 'pasteBody') updatePasteInfo(); savePasteDraft(); }));
$('pasteMode').addEventListener('change', () => { updatePasteInfo(); savePasteDraft(); });
// 貼上新的內容時，分段方式回到自動判斷（避免上次手動選的「只看空行」讓新貼的文字全擠成一段）
$('pasteBody').addEventListener('paste', () => { if ($('pasteMode').value !== 'auto') { $('pasteMode').value = 'auto'; setTimeout(() => { updatePasteInfo(); savePasteDraft(); }, 0); } });
loadDraft();

// 把貼上欄位的內容當成文章來用。成功回傳 true
function usePastedText() {
  const body = pasteResult().text;
  const n = countWordsIn(body);
  const fail = (t) => { showTab('paste'); setPasteMsg(t, true); return false; };
  if (n < 20) return fail('Please use at least 20 words.');
  if (n > 8000) return fail(`That is ${n} words — please keep it under 8000 words (very long texts make the share link too long).`);
  if (!/[A-Za-z]{3}/.test(body)) return fail('This does not look like English text.');
  const title = $('pasteTitle').value.replace(/\s+/g, ' ').trim() || body.split(/\s+/).slice(0, 6).join(' ').replace(/[.,;:!?"“”]+$/, '') + '…';
  current = { source: 'pasted', title, body, level: '', targetWords: n, wordCount: n, withinTolerance: true, questions: toLines($('pasteQ').value), discussion: toLines($('pasteD').value) };
  render(current, []);   // 切到 Article 畫面
  $('pasteMode').value = 'auto'; savePasteDraft();   // 下次貼新的文字時從自動判斷開始
  setPasteMsg(n > 3000 ? `Using ${n} words. Long texts make a long share link — test it before sending.` : PASTE_NOTE);
  return true;
}
$('pasteUse').addEventListener('click', usePastedText);

// ---- 從網址匯入：後端（/api/extract）抓網頁、擷取主要文章，先顯示預覽卡，確認後才使用 ----
const setImportMsg = (t, kind) => { const m = $('importMsg'); m.className = 'importmsg' + (kind ? ' ' + kind : ''); m.textContent = t || ''; };
async function importFromUrl() {
  const url = $('pasteUrl').value.trim(), code = $('code').value.trim();
  if (!url) { setImportMsg('Paste an article link first.', 'err'); return $('pasteUrl').focus(); }
  if (!code) { setImportMsg('Enter the access code in the menu first — importing from a link needs it.', 'err'); return askForCode(); }
  const box = $('importPreview'), btn = $('pasteFetch');
  btn.disabled = true; btn.firstElementChild.textContent = 'Importing…';
  box.classList.remove('hidden'); box.classList.add('loading'); setImportMsg('Reading the page and finding the article…');
  try {
    const j = await postJson('/api/extract', { code, url });
    $('pasteTitle').value = j.title || ''; $('pasteBody').value = j.text; $('pasteMode').value = 'auto';   // 匯入的文字本來就用空行分段，自動判斷即可
    updatePasteInfo(); savePasteDraft();
    $('ipTitle').textContent = j.title || 'Untitled article';
    $('ipHost').textContent = j.host; $('ipWords').textContent = `${j.words.toLocaleString()} words`; $('ipTrunc').classList.toggle('hidden', !j.truncated);
    $('ipExcerpt').textContent = j.text.split('\n\n').slice(0, 3).join(' ');
    box.classList.remove('loading'); setImportMsg('Found the article. Use it as is, or review and edit the text first.', 'ok');
  } catch (e) {
    box.classList.add('hidden'); box.classList.remove('loading'); setImportMsg(e.message, 'err');
    if (e.message === 'Incorrect access code') askForCode();
  } finally { btn.disabled = false; btn.firstElementChild.textContent = 'Import'; }
}
$('pasteFetch').addEventListener('click', importFromUrl);
$('pasteUrl').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); importFromUrl(); } });
$('importUse').addEventListener('click', usePastedText);
$('importEdit').addEventListener('click', () => { showTab('paste'); $('pasteBody').focus(); $('pasteBody').scrollTop = 0; });
