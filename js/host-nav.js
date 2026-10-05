// 主持人頁的導覽：三個畫面（create／read／library）、Create 的四個步驟（choose 選擇方式／gen／paste／link）、手機與平板的側邊欄抽屜
// 需先載入 util.js；host.js 的 current（目前文章）與 host-library.js 的 cloud／refreshCloud 在執行時才使用
let view = 'create';
const VIEW_TITLES = { create: 'Create', read: 'Article', library: 'Library', users: 'Users' };   // 上方列的標題固定，不隨文章標題變動

function showView(v, { push = true, scroll = true } = {}) {
  if (v === 'read' && (typeof current === 'undefined' || !current)) v = 'create';   // 還沒有文章就沒有 Article 畫面
  if (v === 'users' && !(typeof isOwner !== 'undefined' && isOwner && typeof cloud !== 'undefined' && cloud)) v = 'library';   // Users 只有擁有者（雲端模式）才有
  if (!['create', 'read', 'library', 'users'].includes(v)) v = 'create';
  document.querySelectorAll('.view').forEach((el) => el.classList.toggle('hidden', el.dataset.view !== v));
  document.querySelectorAll('button[data-view]').forEach((b) => {   // 側邊欄項目與上方列的快速圖示
    const on = b.dataset.view === v;
    b.classList.toggle('active', on); if (on) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
  });
  $('tbTitle').textContent = VIEW_TITLES[v];
  const changed = v !== view;
  if (changed && push) { try { history.pushState({ v }, '', '#' + v); } catch { /* 忽略 */ } }
  view = v;
  closeNav();
  if (changed && scroll) window.scrollTo(0, 0);
  if (v === 'library' && typeof cloud !== 'undefined' && cloud) refreshCloud();
  if (v === 'users' && typeof loadUsers === 'function') loadUsers();
}

function showTab(t) {
  document.querySelectorAll('[data-panel]').forEach((p) => p.classList.toggle('hidden', p.dataset.panel !== t));
}
// Article 在側邊欄的標題；有文章後才能點
function updateNavArticle(title) { $('navArticle').textContent = title || 'No article yet'; $('navRead').disabled = $('tbRead').disabled = !title; }

// ---- 抽屜（< 1280px）----
const openNav = () => { document.body.classList.add('nav-open'); $('navOpen').setAttribute('aria-expanded', 'true'); };
function closeNav() { document.body.classList.remove('nav-open'); $('navOpen').setAttribute('aria-expanded', 'false'); }

document.querySelectorAll('button[data-view]').forEach((b) => b.addEventListener('click', () => { if (b.dataset.view === 'create') showTab('choose');   // 回到 Create 一律從「選擇方式」開始
     showView(b.dataset.view); closeCodePop(); }));
document.querySelectorAll('[data-goto-tab]').forEach((b) => b.addEventListener('click', () => showTab(b.dataset.gotoTab)));
$('navOpen').addEventListener('click', openNav);
$('navClose').addEventListener('click', closeNav);
$('scrim').addEventListener('click', closeNav);
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && document.body.classList.contains('nav-open')) closeNav(); });
window.addEventListener('popstate', () => showView(location.hash.slice(1) || 'library', { push: false }));
// ---- 收合側邊欄（桌機）：只留圖示；狀態記在瀏覽器裡 ----
function setSideMini(on, save = true) {
  document.body.classList.toggle('side-mini', on);
  const t = $('sideToggle'); t.setAttribute('aria-expanded', String(!on)); t.title = t.ariaLabel = on ? 'Expand menu' : 'Collapse menu';
  document.querySelectorAll('#sidebar .nav-item').forEach((b) => { const l = b.querySelector('.nav-label'); if (on && l) b.title = l.firstChild.textContent.trim(); else b.removeAttribute('title'); });   // 只剩圖示時用提示文字說明
  document.querySelector('.side-foot label').title = on ? 'Access code' : '';
  if (save) { try { localStorage.setItem('rc-side-mini', on ? '1' : '0'); } catch { /* 存不了就算了 */ } }
}
$('sideToggle').addEventListener('click', () => setSideMini(!document.body.classList.contains('side-mini')));
document.querySelector('.side-foot label').addEventListener('click', () => { if (document.body.classList.contains('side-mini')) { setSideMini(false); setTimeout(() => $('code').focus(), 250); } });   // 收合時點鑰匙：展開並輸入存取碼
try { if (localStorage.getItem('rc-side-mini') === '1') setSideMini(true, false); } catch { /* 沒有就維持展開 */ }
// 需要存取碼時：窄螢幕打開抽屜，並把游標放到存取碼欄位
function askForCode() {
  if (matchMedia('(max-width:1279px)').matches) { closeNav(); $('codeQuick').value = $('code').value; $('codePop').classList.remove('hidden'); $('tbKey').setAttribute('aria-expanded', 'true'); setTimeout(() => $('codeQuick').focus(), 100); }
  else { if (document.body.classList.contains('side-mini')) setSideMini(false); setTimeout(() => $('code').focus(), 100); }
}

// 設定視窗開啟時（點齒輪），順便收起抽屜
document.addEventListener('click', (e) => { if (e.target.closest('.gear')) closeNav(); });

// ---- 存取碼快速視窗（上方列的 🔑）：和側邊欄的 #code 同步 ----
function closeCodePop() { $('codePop').classList.add('hidden'); $('tbKey').setAttribute('aria-expanded', 'false'); }
$('tbKey').addEventListener('click', () => {
  const open = $('codePop').classList.contains('hidden');
  if (!open) return closeCodePop();
  $('codeQuick').value = $('code').value;
  $('codePop').classList.remove('hidden'); $('tbKey').setAttribute('aria-expanded', 'true');
  setTimeout(() => $('codeQuick').focus(), 50);
});
for (const ev of ['input', 'change']) $('codeQuick').addEventListener(ev, () => { $('code').value = $('codeQuick').value; $('code').dispatchEvent(new Event(ev, { bubbles: true })); });
$('codeQuick').addEventListener('keydown', (e) => { if (e.key === 'Enter') closeCodePop(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeCodePop(); });
document.addEventListener('pointerdown', (e) => { if (!$('codePop').classList.contains('hidden') && !$('codePop').contains(e.target) && !$('tbKey').contains(e.target)) closeCodePop(); });
