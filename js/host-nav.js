// 主持人頁的導覽：三個畫面（create／read／library）、Create 的三個分頁（gen／paste／link）、手機與平板的側邊欄抽屜
// 需先載入 util.js；host.js 的 current（目前文章）與 host-library.js 的 cloud／refreshCloud 在執行時才使用
let view = 'create';
const VIEW_TITLES = { create: 'Create', library: 'Library' };

function showView(v, { push = true, scroll = true } = {}) {
  if (v === 'read' && (typeof current === 'undefined' || !current)) v = 'create';   // 還沒有文章就沒有 Article 畫面
  if (!['create', 'read', 'library'].includes(v)) v = 'create';
  document.querySelectorAll('.view').forEach((el) => el.classList.toggle('hidden', el.dataset.view !== v));
  document.querySelectorAll('.nav-item[data-view]').forEach((b) => {
    const on = b.dataset.view === v;
    b.classList.toggle('active', on); if (on) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
  });
  $('tbTitle').textContent = VIEW_TITLES[v] || (typeof current !== 'undefined' && current ? current.title : 'Article');
  const changed = v !== view;
  if (changed && push) { try { history.pushState({ v }, '', '#' + v); } catch { /* 忽略 */ } }
  view = v;
  closeNav();
  if (changed && scroll) window.scrollTo(0, 0);
  if (v === 'library' && typeof cloud !== 'undefined' && cloud) refreshCloud();
}

function showTab(t) {
  document.querySelectorAll('.tab').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === t)));
  document.querySelectorAll('[data-panel]').forEach((p) => p.classList.toggle('hidden', p.dataset.panel !== t));
}
// Article 在側邊欄的標題；有文章後才能點
function updateNavArticle(title) { $('navArticle').textContent = title || 'No article yet'; $('navRead').disabled = !title; if (view === 'read') $('tbTitle').textContent = title; }

// ---- 抽屜（< 1280px）----
const openNav = () => { document.body.classList.add('nav-open'); $('navOpen').setAttribute('aria-expanded', 'true'); };
function closeNav() { document.body.classList.remove('nav-open'); $('navOpen').setAttribute('aria-expanded', 'false'); }

document.querySelectorAll('.nav-item[data-view]').forEach((b) => b.addEventListener('click', () => showView(b.dataset.view)));
document.querySelectorAll('.tab').forEach((b) => b.addEventListener('click', () => showTab(b.dataset.tab)));
document.querySelectorAll('[data-goto-tab]').forEach((b) => b.addEventListener('click', () => showTab(b.dataset.gotoTab)));
$('navOpen').addEventListener('click', openNav);
$('navClose').addEventListener('click', closeNav);
$('scrim').addEventListener('click', closeNav);
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && document.body.classList.contains('nav-open')) closeNav(); });
window.addEventListener('popstate', () => showView(location.hash.slice(1) || 'create', { push: false }));
// 需要存取碼時：窄螢幕打開抽屜，並把游標放到存取碼欄位
function askForCode() { if (matchMedia('(max-width:1279px)').matches) openNav(); setTimeout(() => $('code').focus(), 300); }

// 設定視窗開啟時（點齒輪），順便收起抽屜
document.addEventListener('click', (e) => { if (e.target.closest('.gear')) closeNav(); });
