// 主持人頁：就地編輯（所見即所得）— 標題、本文、題目直接在畫面上改
let editState = null; // { dirty, libId }

// 只接受純文字（不支援 plaintext-only 的瀏覽器退回一般模式，並由 paste 事件攔截成純文字）
const PLAIN = (el) => { el.contentEditable = 'plaintext-only'; if (el.contentEditable !== 'plaintext-only') el.contentEditable = 'true'; el.spellcheck = false; };
const MAX_Q = 5;
const qItem = (t) => `<li><span class="qtext">${esc(t)}</span><button type="button" class="qdel" title="Remove this question" aria-label="Remove this question">×</button></li>`;
const qSection = (kind, title, arr) => `<section data-kind="${kind}"><h3>${title}</h3><ol>${arr.map(qItem).join('')}</ol><button type="button" class="secondary addq" data-kind="${kind}">＋ Add question</button></section>`;
const makePlain = (root) => root.querySelectorAll('.qtext').forEach(PLAIN);

// 在 ol 裡 afterLi 後面（沒有就加在最後）新增一個空白題目並對焦
function addQuestion(ol, afterLi) {
  if (ol.children.length >= MAX_Q) return;
  const li = document.createElement('li');
  li.innerHTML = qItem('').replace(/^<li>|<\/li>$/g, '');
  if (afterLi) afterLi.after(li); else ol.append(li);
  makePlain(li); li.querySelector('.qtext').focus(); markDirty();
}

function startEdit() {
  if (!current || editState) return;
  closePaste(); $('library').classList.add('hidden');
  editState = { dirty: false, libId: currentLibId };
  Vocab.freeze(true);   // 編輯期間不重畫文章，避免打字時內容被覆蓋
  document.body.classList.add('editing');
  PLAIN($('doc').querySelector('h2'));
  const body = $('bodyText'); PLAIN(body);
  body.textContent = current.body.split(/\n\s*\n/).filter((p) => p.trim()).map((p) => p.replace(/\s*\n\s*/g, ' ')).join('\n\n');
  $('qa').innerHTML = qSection('q', 'Comprehension questions', current.questions || []) + qSection('d', 'Discussion questions', current.discussion || []);
  makePlain($('qa'));
  $('editBar').classList.remove('hidden'); $('previewActions').classList.add('hidden');
  $('editMsg').textContent = ''; updateEditInfo();
  $('preview').scrollIntoView({ behavior: 'smooth', block: 'start' });
  body.focus();
}
const bodyParagraphs = () => $('bodyText').innerText.replace(/\r/g, '').split(/\n+/).map((l) => l.replace(/\s+/g, ' ').trim()).filter(Boolean); // 每個換行 = 一個段落
const updateEditInfo = () => { $('editInfo').textContent = `${countWordsIn(bodyParagraphs().join(' '))} words`; };
const readQuestions = (kind) => [...$('qa').querySelectorAll(`section[data-kind="${kind}"] .qtext`)].map((e) => e.textContent.replace(/\s+/g, ' ').trim()).filter(Boolean).slice(0, MAX_Q);
const markDirty = () => { if (editState) { editState.dirty = true; $('editMsg').textContent = ''; } };

function endEdit() { editState = null; Vocab.freeze(false); document.body.classList.remove('editing'); $('editBar').classList.add('hidden'); $('previewActions').classList.remove('hidden'); }

async function saveEdit() {
  if (!editState) return;
  const paras = bodyParagraphs(), n = countWordsIn(paras.join(' '));
  const fail = (t) => { $('editMsg').textContent = t; };
  if (n < 20) return fail('Please keep at least 20 words.');
  if (n > 8000) return fail(`That is ${n} words — please keep it under 8000.`);
  if (!/[A-Za-z]{3}/.test(paras.join(' '))) return fail('This does not look like English text.');
  const title = $('doc').querySelector('h2').textContent.replace(/\s+/g, ' ').trim().slice(0, 200) || paras[0].split(/\s+/).slice(0, 6).join(' ') + '…';
  const libId = editState.libId, keep = settledVocab();
  current = { ...current, title, body: paras.join('\n\n'), wordCount: n, targetWords: 0, withinTolerance: true, questions: readQuestions('q'), discussion: readQuestions('d') }; // 編輯過就沒有「目標字數」
  endEdit(); render(current, keep, libId);
  if (libId) await persistEdit(); else $('linkMsg').textContent = 'Changes applied. Press “Save article” to keep them in your library.';
}
function cancelEdit() {
  if (!editState) return;
  if (editState.dirty && !confirm('Discard your changes?')) return;
  const libId = editState.libId, keep = settledVocab();
  endEdit(); render(current, keep, libId);
}

$('editText').addEventListener('click', startEdit);
$('editSave').addEventListener('click', saveEdit);
$('editCancel').addEventListener('click', cancelEdit);

// 輸入：標記為已修改、更新字數；標題按 Enter 不換行；題目按 Enter 新增一題；Ctrl/⌘+S 儲存
$('preview').addEventListener('input', (e) => { if (!editState) return; markDirty(); if (e.target.id === 'bodyText') updateEditInfo(); });
$('preview').addEventListener('keydown', (e) => {
  if (!editState) return;
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); saveEdit(); return; }
  if (e.key === 'Enter' && e.target.matches('h2')) e.preventDefault();
  if (e.key === 'Enter' && e.target.matches('.qtext')) { e.preventDefault(); addQuestion(e.target.closest('ol'), e.target.closest('li')); }
});
$('preview').addEventListener('paste', (e) => { // 一律貼成純文字
  if (!editState || !e.target.closest('[contenteditable]')) return;
  e.preventDefault();
  let t = (e.clipboardData || window.clipboardData).getData('text/plain').replace(/\r/g, '');
  if (!e.target.closest('#bodyText')) t = t.replace(/\s*\n\s*/g, ' '); // 標題與題目是單行
  document.execCommand('insertText', false, t);
});
$('qa').addEventListener('click', (e) => {
  if (!editState) return;
  const del = e.target.closest('.qdel'); if (del) { del.closest('li').remove(); markDirty(); return; }
  const add = e.target.closest('.addq'); if (add) addQuestion(add.closest('section').querySelector('ol'));
});
