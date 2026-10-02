// 主持人頁：貼上自己的文章
// 文字整理（normalizePasted、toLines、countWordsIn）在 paste-text.js

const PASTE_KEY = 'rc-paste-draft';
const PF = { t: 'pasteTitle', b: 'pasteBody', q: 'pasteQ', d: 'pasteD', m: 'pasteMode' };   // 草稿欄位 → 輸入框 id
const PASTE_NOTE = 'No access code needed — pasted text is not sent to the AI. You can look up words, save it to your library and share it just like a generated article. URLs in the text become clickable links.';

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
$('pasteClear').addEventListener('click', () => { fillPaste({}); savePasteDraft(); $('pasteBody').focus(); });
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
