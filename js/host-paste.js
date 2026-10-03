// 主持人頁：貼上自己的文章
// 文字整理（normalizePasted、toLines、countWordsIn）在 paste-text.js

const PASTE_KEY = 'rc-paste-draft';
const PF = { t: 'pasteTitle', b: 'pasteBody', q: 'pasteQ', d: 'pasteD', m: 'pasteMode' };   // 草稿欄位 → 輸入框 id
const PASTE_NOTE = 'Pasted text is not sent to the AI and needs no access code. Importing from a link does need the access code (top bar). You can look up words, save it to your library and share it just like a generated article. URLs in the text become clickable links.';

function savePasteDraft() { try { localStorage.setItem(PASTE_KEY, JSON.stringify(Object.fromEntries(Object.entries(PF).map(([k, id]) => [k, $(id).value])))); } catch { /* 忽略 */ } }
const HOW = { blank: 'blank lines', lines: 'each line break', joined: 'line breaks joined (hard-wrapped text)' };
const pasteResult = () => normalizePasted($('pasteBody').value, $('pasteMode').value);
const paraCount = (text) => text ? text.split('\n\n').length : 0;
function updatePasteInfo() {   // 字數與目前會得到的段落數（自動模式也顯示判斷結果）
  const { text, how } = pasteResult();
  $('pasteInfo').textContent = `${countWordsIn(text)} words · ${paraCount(text)} paragraph${paraCount(text) === 1 ? '' : 's'}${$('pasteMode').value === 'auto' && text ? ` (auto: ${HOW[how]})` : ''}`;
}
function fillPaste(o) { Object.entries(PF).forEach(([k, id]) => { $(id).value = o[k] || (k === 'm' ? 'auto' : ''); }); updatePasteInfo(); }
function loadDraft() { let d = {}; try { d = JSON.parse(localStorage.getItem(PASTE_KEY) || '{}') || {}; } catch { /* 忽略 */ } fillPaste(d); }
function setPasteMsg(t, err) { $('pasteMsg').className = err ? 'msg err' : 'meta'; $('pasteMsg').textContent = t; }

function openPaste() {
  loadDraft();
  setPasteMsg(PASTE_NOTE);
  $('pastePanel').classList.remove('hidden'); $('library').classList.add('hidden');
  $('pasteBody').focus(); $('pastePanel').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}
const closePaste = () => $('pastePanel').classList.add('hidden');

$('pasteBtn').addEventListener('click', () => $('pastePanel').classList.contains('hidden') ? openPaste() : closePaste());
$('pasteCancel').addEventListener('click', closePaste);
$('pasteClear').addEventListener('click', () => { fillPaste({}); $('pasteUrl').value = ''; savePasteDraft(); $('pasteBody').focus(); });
Object.values(PF).forEach((id) => $(id).addEventListener('input', () => { if (id === 'pasteBody') updatePasteInfo(); savePasteDraft(); }));
$('pasteMode').addEventListener('change', () => { updatePasteInfo(); savePasteDraft(); });
loadDraft();

$('pasteUse').addEventListener('click', () => {
  const body = pasteResult().text;
  const n = countWordsIn(body);
  if (n < 20) return setPasteMsg('Please use at least 20 words.', true);
  if (n > 8000) return setPasteMsg(`That is ${n} words — please keep it under 8000 words (very long texts make the share link too long).`, true);
  if (!/[A-Za-z]{3}/.test(body)) return setPasteMsg('This does not look like English text.', true);
  const title = $('pasteTitle').value.replace(/\s+/g, ' ').trim() || body.split(/\s+/).slice(0, 6).join(' ').replace(/[.,;:!?"“”]+$/, '') + '…';
  current = { source: 'pasted', title, body, level: '', targetWords: n, wordCount: n, withinTolerance: true, questions: toLines($('pasteQ').value), discussion: toLines($('pasteD').value) };
  render(current, []);
  closePaste();
  $('preview').scrollIntoView({ behavior: 'smooth', block: 'start' });
  setPasteMsg(n > 3000 ? `Using ${n} words. Long texts make a long share link — test it before sending.` : PASTE_NOTE);
});

// ---- 從網址匯入：後端（/api/extract）抓網頁、擷取主要文章，填進標題與本文，讓你確認後再按 Use this text ----
async function importFromUrl() {
  const url = $('pasteUrl').value.trim(), code = $('code').value.trim();
  if (!url) return setPasteMsg('Paste an article link first.', true);
  if (!code) return setPasteMsg('Enter the access code in the top bar first — importing from a link needs it.', true);
  if ($('pasteBody').value.trim() && !confirm('Replace the text below with the article from this link?')) return;
  $('pasteFetch').disabled = true; setPasteMsg('⏳ Reading the page…');
  try {
    const j = await postJson('/api/extract', { code, url });
    $('pasteTitle').value = j.title || ''; $('pasteBody').value = j.text;
    updatePasteInfo(); savePasteDraft();
    setPasteMsg(`✅ Imported ${j.words} words from ${j.host}${j.truncated ? ' (shortened to fit the limit)' : ''}. Check the text, then press “Use this text”. For personal study — please respect the site’s copyright.`);
    $('pasteBody').scrollTop = 0;
  } catch (e) { setPasteMsg('❌ ' + e.message, true); }
  finally { $('pasteFetch').disabled = false; }
}
$('pasteFetch').addEventListener('click', importFromUrl);
$('pasteUrl').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); importFromUrl(); } });
