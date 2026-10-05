// 主持人頁：文章庫
// 雲端模式（後端已設定 Upstash Redis）：文章存在雲端，任何裝置輸入存取碼都看得到；分享連結是短連結，內容永遠是最新版。
// 本機模式（沒設定雲端）：存在這台瀏覽器的 localStorage，可匯出/匯入備份；分享連結把文章壓縮放在網址裡。
let cloud = false;     // 是否使用雲端文章庫（啟動時向後端詢問）
let cloudItems = [];   // 雲端文章清單（摘要）
let cloudErr = '';     // 最近一次讀取雲端清單的錯誤

const LIB_KEY = 'rc-library';
const libLoad = () => { try { const l = JSON.parse(localStorage.getItem(LIB_KEY) || '[]'); return Array.isArray(l) ? l : []; } catch { return []; } };
const libStore = (l) => { try { localStorage.setItem(LIB_KEY, JSON.stringify(l)); return true; } catch { return false; } };
const validArticle = (a) => a && typeof a.title === 'string' && typeof a.body === 'string';
const REL = (n) => `${n} article${n === 1 ? '' : 's'}`;

// 目前單字表（只存查詢完成的字）
const settledVocab = () => Vocab.getItems().filter((v) => !v.loading && !v.failed).map(({ word, pos, definition, zh, kk, lemma }) => ({ word, pos, definition, zh, kk, lemma }));

// 目前單字表的「簽名」：和上次存檔的比較，才知道單字表是不是真的有增減（render 重畫、查詢中的更新不算）
let vocabSig = '[]';
const sigNow = () => JSON.stringify(settledVocab());
const markSynced = () => { vocabSig = sigNow(); };

// ---- 雲端 ----
function cloudCall(body) {
  const code = $('code').value.trim();
  if (!code) return Promise.reject(new Error('Enter the access code first'));
  return postJson('/api/library', { code, ...body });
}
async function refreshCloud() {
  if (!cloud) return;
  try { cloudItems = (await cloudCall({ action: 'list' })).items; cloudErr = ''; } catch (e) { cloudItems = []; cloudErr = e.message; }
  renderLib();
}
// 存到雲端（新文章 → 新 id；已在雲端的文章 → 更新同一個 id，短連結不變）
async function cloudSave() {
  const res = await cloudCall({ action: 'save', id: currentLibId || undefined, article: current, vocab: settledVocab() });
  currentLibId = res.id; markSynced();
  return res.id;
}

// ---- 清單 ----
// 雲端與本機統一成同一種清單格式
const libEntries = () => cloud
  ? cloudItems.map((i) => ({ id: i.id, title: i.title, level: i.level, words: i.wordCount, vocab: i.vocabCount, ts: i.updatedAt }))
  : libLoad().map((it) => ({ id: it.id, title: it.article.title, level: it.article.level, words: it.article.wordCount, vocab: (it.vocab || []).length, ts: it.savedAt }));

let libQuery = '';
let libSort = { key: 'ts', dir: -1 };   // 排序欄位與方向（1 小到大、-1 大到小），記在瀏覽器裡
try { const s = JSON.parse(localStorage.getItem('rc-lib-sort') || 'null'); if (s && ['title', 'level', 'words', 'vocab', 'ts'].includes(s.key)) libSort = { key: s.key, dir: s.dir === 1 ? 1 : -1 }; } catch { /* 沒有就用預設 */ }
const fmtDate = (ts) => { try { return new Date(ts).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }); } catch { return ''; } };
const COLS = [   // [排序鍵, 標題, class]
  ['title', 'Title', 'c-t'], ['level', 'Level', 'c-level'], ['words', 'Words', 'c-num c-words'], ['vocab', 'Vocab', 'c-num c-vocab'], ['ts', 'Updated', 'c-when'],
];
function sortedEntries(list) {
  const { key, dir } = libSort, val = (it) => (key === 'title' ? it.title.toLowerCase() : key === 'level' ? (it.level || '') : (it[key] || 0));
  return list.slice().sort((x, y) => {
    const a = val(x), b = val(y);
    if (key === 'level' && (!a || !b) && a !== b) return a ? -1 : 1;   // 沒有等級（貼上的文章）一律排最後
    return (typeof a === 'string' ? a.localeCompare(b) : a - b) * dir || x.title.localeCompare(y.title);
  });
}
function renderLib() {
  const all = libEntries(), local = libLoad();
  const q = libQuery.trim().toLowerCase(), l = sortedEntries(q ? all.filter((it) => it.title.toLowerCase().includes(q)) : all);
  $('libCount').textContent = cloud && cloudErr ? '–' : all.length;
  $('tbLibCount').textContent = all.length; $('tbLibCount').dataset.n = cloud && cloudErr ? 0 : all.length;
  $('libSub').textContent = cloud ? 'Cloud · any device' : 'Saved in this browser';
  $('libTitle').textContent = 'Library';
  $('libSubtitle').textContent = cloud ? 'Cloud library — open it on any device with your access code.' : 'Saved in this browser. Set up cloud storage to open articles on any device.';
  $('libExport').classList.toggle('hidden', cloud); $('libImport').classList.toggle('hidden', cloud);
  $('libUpload').classList.toggle('hidden', !(cloud && local.length));
  $('libDiag').classList.toggle('hidden', cloud); // 還沒啟用雲端時，提供「檢查雲端設定」
  $('libUpload').textContent = `Upload ${REL(local.length)} from this browser`;
  if (typeof syncUsersBtn === 'function') syncUsersBtn();   // 擁有者 + 雲端模式才顯示「Manage users」（host-users.js）
  $('libSortSel').value = `${libSort.key}:${libSort.dir}`;
  if (cloud && cloudErr) { $('libList').innerHTML = `<div class="empty-state"><strong>Could not load the library</strong>${esc(cloudErr)}</div>`; return; }
  if (!l.length) { $('libList').innerHTML = q ? `<div class="empty-state"><strong>No matches</strong>Nothing in your library matches “${esc(libQuery)}”.</div>` : '<div class="empty-state"><strong>No saved articles yet</strong>Create an article and press Save (or just add a word — it saves automatically).</div>'; return; }
  const th = COLS.map(([k, label, cls]) => `<th class="${cls}" aria-sort="${libSort.key === k ? (libSort.dir === 1 ? 'ascending' : 'descending') : 'none'}"><button type="button" class="sortbtn${libSort.key === k ? ' on' : ''}" data-sort="${k}" title="Sort by ${label}">${label}<span class="arr" aria-hidden="true">${libSort.key === k ? (libSort.dir === 1 ? '▲' : '▼') : '↕'}</span></button></th>`).join('');
  const rows = l.map((it) =>
    `<tr data-id="${esc(it.id)}"><td class="c-t"><div class="t" title="Double-click to open">${esc(it.title)}</div><div class="sub">${it.level ? esc(it.level) + ' · ' : ''}${it.words || 0} words · ${it.vocab} vocab · ${fmtDate(it.ts)}</div></td>` +
    `<td class="c-level">${it.level ? `<span class="chip lv">${esc(it.level)}</span>` : '<span class="chip">Pasted</span>'}</td>` +
    `<td class="c-num c-words">${(it.words || 0).toLocaleString()}</td><td class="c-num c-vocab">${it.vocab}</td>` +
    `<td class="c-when">${fmtDate(it.ts)}</td>` +
    '<td class="c-act"><div class="acts"><button type="button" class="act primary" data-act="open">Open</button><button type="button" class="act" data-act="edit">Edit</button><button type="button" class="act" data-act="copy">Copy link</button><button type="button" class="act danger" data-act="del" aria-label="Delete">Delete</button></div></td></tr>'
  ).join('');
  $('libList').innerHTML = `<table class="libtable"><thead><tr>${th}<th class="c-act"><span class="sr">Actions</span></th></tr></thead><tbody>${rows}</tbody></table>` +
    `<div class="libfoot">${l.length} article${l.length === 1 ? '' : 's'}${q ? ` matching “${esc(libQuery)}”` : ''} · double-click a title to open it</div>`;
}
function setSort(key, dir) {
  libSort = { key, dir: dir ?? (libSort.key === key ? -libSort.dir : (key === 'title' || key === 'level' ? 1 : -1)) };   // 再按同一欄 = 反向；新的一欄：文字由小到大、數字與日期由大到小
  try { localStorage.setItem('rc-lib-sort', JSON.stringify(libSort)); } catch { /* 存不了就算了 */ }
  renderLib();
}
$('libSortSel').addEventListener('change', (e) => { const [k, d] = e.target.value.split(':'); setSort(k, +d); });
$('libSearch').addEventListener('input', (e) => { libQuery = e.target.value; renderLib(); });
$('code').addEventListener('change', () => { if (cloud) refreshCloud(); });

// ---- 儲存 / 同步 ----
// 編輯後：文章已在文章庫 → 存回文章庫（雲端：同一個 id，短連結內容跟著更新）
async function persistEdit() {
  try {
    if (cloud) { const id = await cloudSave(); showLink(shortLink(id)); $('linkMsg').textContent = '✅ Changes saved to the cloud library. The share link now shows the updated article.'; await refreshCloud(); return; }
    const l = libLoad(), it = l.find((x) => x.id === currentLibId); if (!it) return;
    it.article = current; it.vocab = settledVocab(); markSynced();
    $('linkMsg').textContent = libStore(l) ? '✅ Changes saved to your library. (Links you already shared keep the old version — create a new link to share this one.)' : '❌ Could not save';
    renderLib();
  } catch (e) { $('linkMsg').textContent = '❌ ' + e.message; }
}

// 本機文章庫存檔：已有同標題同內容的就更新單字，否則新增一筆。回傳 { ok, vocab, created }
function localSaveCurrent() {
  const l = libLoad(), vocab = settledVocab();
  const dup = l.find((it) => it.article.body === current.body && it.article.title === current.title);
  let created = false;
  if (dup) { dup.vocab = vocab; currentLibId = dup.id; }
  else {
    const entry = { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), savedAt: Date.now(), article: current, vocab };
    l.unshift(entry); currentLibId = entry.id; created = true;
  }
  const ok = libStore(l);
  if (ok) markSynced();
  renderLib();
  return { ok, vocab, created };
}

// 單字表有增減就自動存檔：文章還沒存過 → 自動存成新文章；已在文章庫 → 更新同一篇（等查詢完成、稍微延遲後存）
let syncTimer = null;
function syncLib() {
  if (!current || editState) return;
  clearTimeout(syncTimer);
  syncTimer = setTimeout(async () => {
    if (!current || editState || Vocab.getItems().some((v) => v.loading)) return; // 還在查詢中，查完會再觸發一次
    if (sigNow() === vocabSig) return;                                              // 單字表沒有真的變動
    const isNew = !currentLibId;
    if (isNew && cloud && !$('code').value.trim()) return;                          // 雲端要存取碼；沒有就先不存
    const n = settledVocab().length;
    if (cloud) {
      try {
        await cloudSave();
        $('vmsg').textContent = isNew ? `Article saved to the cloud library automatically (${n} vocabulary words).` : `Vocabulary saved to the cloud library (${n}).`;
        refreshCloud();
      } catch (e) { $('vmsg').textContent = `Could not sync to the cloud: ${e.message}`; }
      return;
    }
    const r = localSaveCurrent();
    if (r.ok) $('vmsg').textContent = r.created ? `Article saved to your library automatically (${n} vocabulary words).` : `Vocabulary saved to library (${n}).`;
    else $('vmsg').textContent = 'Could not save: browser storage is full or blocked.';
  }, 400);
}

// Save 鈕：存好後短暫變成「Saved ✓」
function flashSaved() {
  const b = $('save'), label = b.querySelector('span'), use = b.querySelector('use');
  label.textContent = 'Saved'; use.setAttribute('href', '#i-check'); b.classList.add('done');
  setTimeout(() => { label.textContent = 'Save'; use.setAttribute('href', '#i-save'); b.classList.remove('done'); }, 2200);
}
$('save').addEventListener('click', async () => {
  if (!current) return;
  if (cloud) {
    $('save').disabled = true;
    try {
      const id = await cloudSave(); showLink(shortLink(id));
      $('linkMsg').textContent = `✅ Saved to the cloud library with ${settledVocab().length} vocabulary words. The share link below works on any device; edits you make here (like new words) update it automatically.`;
      await refreshCloud(); flashSaved();
    } catch (e) { $('linkMsg').textContent = '❌ ' + e.message; }
    finally { $('save').disabled = false; }
    return;
  }
  const r = localSaveCurrent();
  $('linkMsg').textContent = !r.ok ? '❌ Could not save: browser storage is full or blocked. Use “Create share link” instead.'
    : r.created ? `✅ Saved to your library with ${r.vocab.length} vocabulary words. New words you add now are saved automatically (stored in this browser only — export a backup now and then)`
    : `✅ Library entry updated (${r.vocab.length} vocabulary words)`;
  if (r.ok) flashSaved();
});

// ---- 清單上的按鈕：開啟 / 編輯 / 複製連結 / 刪除 ----
let lastTitleTap = { id: '', t: 0 };
$('libList').addEventListener('click', async (e) => {
  const sb = e.target.closest('button[data-sort]'); if (sb) return setSort(sb.dataset.sort);
  const title = e.target.closest('.t');   // 標題連點兩下 = 開啟（自己計時，iPad 的 dblclick 不可靠）
  if (title) {
    const tid = title.closest('tr').dataset.id, now = Date.now();
    if (lastTitleTap.id === tid && now - lastTitleTap.t < 500) { lastTitleTap = { id: '', t: 0 }; getSelection()?.removeAllRanges(); return openFromLibrary(tid, 'open'); }
    lastTitleTap = { id: tid, t: now }; return;
  }
  const btn = e.target.closest('button[data-act]'); if (!btn) return;
  openFromLibrary(btn.closest('tr').dataset.id, btn.dataset.act, btn);
});
async function openFromLibrary(id, act, btn) {
  const afterOpen = () => {
    if (act === 'edit') startEdit();   // 開啟後 render() 已切到 Article 畫面
  };
  try {
    if (cloud) {
      if (act === 'open' || act === 'edit') {
        const r = await cloudCall({ action: 'get', id });
        openArticle(r.article, r.vocab, id);
        showLink(shortLink(id)); $('linkMsg').textContent = 'Opened from the cloud library. Its share link is ready below.';
        afterOpen();
      } else if (act === 'copy') copyText(shortLink(id), btn, 'Copy link');
      else if (act === 'del') {
        const title = document.querySelector(`#libList tr[data-id="${CSS.escape(id)}"] .t`)?.textContent || '';
        if (!confirm(`Delete “${title}” from the cloud library?\nIts share link will stop working for everyone.`)) return;
        await cloudCall({ action: 'delete', id });
        if (currentLibId === id) currentLibId = null;
        await refreshCloud();
      }
      return;
    }
    const l = libLoad(), it = l.find((x) => x.id === id); if (!it) return;
    if (act === 'open' || act === 'edit') { openArticle(it.article, it.vocab, it.id); afterOpen(); } // 開啟後，單字表的變動會自動同步回文章庫
    else if (act === 'copy') copyText(await buildLink(it.article, it.vocab || []), btn, 'Copy link');
    else if (act === 'del') {
      if (!confirm(`Delete “${it.article.title}”? Links you already shared are not affected.`)) return;
      libStore(l.filter((x) => x.id !== id)); renderLib();
    }
  } catch (err) { $('libMsg').textContent = '❌ ' + err.message; }
}

// ---- 雲端設定檢查 / 上傳本機文章 ----
// 列出伺服器找到的相關環境變數「名稱」與連線測試（需存取碼，不會顯示任何值）
$('libDiag').addEventListener('click', async () => {
  $('libMsg').className = 'meta'; $('libMsg').textContent = 'Checking…';
  try {
    const j = await cloudCall({ action: 'diagnose' });
    const vars = j.relatedVariables.length ? j.relatedVariables.join(', ') : '(none found)';
    $('libMsg').innerHTML = `<b>Cloud storage: ${j.configured ? '✅ configured' : '❌ not configured'}</b><br>Related environment variables on the server: <code>${esc(vars)}</code><br>` +
      (j.configured ? `Using <code>${esc(j.usingUrlVariable)}</code> + <code>${esc(j.usingTokenVariable)}</code> → ${esc(j.urlHost || '')} → ping: <b>${esc(String(j.ping))}</b>${j.ping === 'PONG' ? '<br>✅ Connected. Reload this page (the button should become ☁ Library).' : ''}`
      : 'Need a REST URL and a REST token variable (e.g. KV_REST_API_URL / KV_REST_API_TOKEN). If none are listed: connect the Upstash database to this project in Vercel → Storage, enable Production, then Redeploy.');
  } catch (e) { $('libMsg').className = 'msg err'; $('libMsg').textContent = '❌ ' + e.message; }
});

// 把這個瀏覽器裡的舊文章庫上傳到雲端（已存在同標題同字數的會略過）
$('libUpload').addEventListener('click', async () => {
  const local = libLoad(); if (!local.length) return;
  $('libUpload').disabled = true; $('libMsg').textContent = 'Uploading…';
  let n = 0, skipped = 0;
  try {
    await refreshCloud(); if (cloudErr) throw new Error(cloudErr);
    const have = new Set(cloudItems.map((i) => `${i.title}|${i.wordCount}`));
    for (const it of local.slice().reverse()) { // 舊的先傳，讓清單順序保持
      const key = `${it.article.title}|${it.article.wordCount}`;
      if (have.has(key)) { skipped++; continue; }
      await cloudCall({ action: 'save', article: it.article, vocab: it.vocab || [] });
      have.add(key); n++;
    }
    await refreshCloud();
    $('libMsg').textContent = `✅ Uploaded ${REL(n)}${skipped ? ` (${skipped} already in the cloud)` : ''}.`;
    if (confirm(`Uploaded ${n}, skipped ${skipped}.\nRemove the local copies from this browser? (The cloud copies stay.)`)) { libStore([]); renderLib(); }
  } catch (e) { $('libMsg').textContent = '❌ ' + e.message; }
  finally { $('libUpload').disabled = false; }
});

// ---- 本機文章庫的匯出 / 匯入備份 ----
$('libExport').addEventListener('click', () => {
  const blob = new Blob([JSON.stringify({ app: 'reading-club', version: 1, items: libLoad() }, null, 1)], { type: 'application/json' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
  a.download = `reading-club-library-${new Date().toISOString().slice(0, 10)}.json`; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
});
$('libImport').addEventListener('click', () => $('libFile').click());
$('libFile').addEventListener('change', async () => {
  const f = $('libFile').files[0]; $('libFile').value = ''; if (!f) return;
  try {
    const j = JSON.parse(await f.text());
    const incoming = (Array.isArray(j) ? j : j.items || []).filter((it) => validArticle(it?.article));
    const l = libLoad(); let n = 0;
    incoming.forEach((it) => {
      if (l.some((x) => x.id === it.id || (x.article.body === it.article.body && x.article.title === it.article.title))) return;
      l.push({ id: String(it.id || Date.now() + Math.random()), savedAt: Number(it.savedAt) || Date.now(), article: it.article, vocab: Array.isArray(it.vocab) ? it.vocab : [] }); n++;
    });
    l.sort((a, b) => b.savedAt - a.savedAt);
    alert(libStore(l) ? `Imported ${n} article(s)` : 'Import failed: browser storage is full');
  } catch { alert('Import failed: not a valid backup file'); }
  renderLib();
});

// 啟動：後端已設定雲端儲存 → 改用雲端文章庫
renderLib();
postJson('/api/library', { action: 'status' }).then((j) => { cloud = !!j.configured; }, () => { cloud = false; }).then(() => {
  renderLib();
  if (cloud && $('code').value.trim()) refreshCloud();
});
