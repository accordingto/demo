// 主持人頁：貼上自己的文章
const countWordsIn = (t) => (t.trim().match(/\S+/g) || []).length;

// 整理貼上的文字：統一換行、去掉控制字元；若整篇都用單一換行分段（每行都是完整句子），就當成一行一段
function normalizePasted(raw) {
  let t = String(raw).replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f​﻿]/g, '').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  const lines = t.split('\n').filter((l) => l.trim());
  if (!/\n\s*\n/.test(t) && lines.length >= 3 && lines.filter((l) => /[.!?…"”’')]\s*$/.test(l.trim())).length / lines.length > 0.8) t = lines.map((l) => l.trim()).join('\n\n');
  return t;
}
// 每行一題：去掉編號／項目符號，最多 5 題
const toLines = (v) => v.split('\n').map((l) => l.replace(/^\s*(?:\d+[.)]|[-*•])\s*/, '').trim()).filter(Boolean).slice(0, 5);

const PASTE_KEY = 'rc-paste-draft';
const PF = { t: 'pasteTitle', b: 'pasteBody', q: 'pasteQ', d: 'pasteD' };   // 草稿欄位 → 輸入框 id
const PASTE_NOTE = 'No access code needed — pasted text is not sent to the AI. You can look up words, save it to your library and share it just like a generated article. URLs in the text become clickable links.';

function savePasteDraft() { try { localStorage.setItem(PASTE_KEY, JSON.stringify(Object.fromEntries(Object.entries(PF).map(([k, id]) => [k, $(id).value])))); } catch { /* 忽略 */ } }
function updatePasteInfo() { $('pasteInfo').textContent = `${countWordsIn($('pasteBody').value)} words`; }
function fillPaste(o) { Object.entries(PF).forEach(([k, id]) => { $(id).value = o[k] || ''; }); updatePasteInfo(); }
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
loadDraft();

$('pasteUse').addEventListener('click', () => {
  const body = normalizePasted($('pasteBody').value);
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
