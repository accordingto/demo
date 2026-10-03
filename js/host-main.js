// 主持人頁的啟動：最後載入。單字表第一次繪製就會呼叫 syncLib，所以要等所有檔案都載入後才初始化。
Vocab.init({ getBody: () => current?.body, onChange: syncLib });   // 單字表／雙擊加字／標示／朗讀（共用 vocab.js）

// 語言程度（CEFR）選擇鈕：背後仍是 #level 這個 select（設定記憶、送出表單都用它）
const LEVELS = [['A1', 'Beginner'], ['A2', 'Elementary'], ['B1', 'Intermediate'], ['B2', 'Upper-intermediate'], ['C1', 'Advanced'], ['C2', 'Mastery']];
$('levelChips').innerHTML = LEVELS.map(([v]) => `<button type="button" class="chip-btn" data-v="${v}">${v}</button>`).join('');
function syncLevelChips() {
  const v = $('level').value;
  $('levelChips').querySelectorAll('.chip-btn').forEach((b) => { const on = b.dataset.v === v; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on); });
  $('levelName').textContent = '· ' + (LEVELS.find(([k]) => k === v) || ['', ''])[1];
}
$('levelChips').addEventListener('click', (e) => { const b = e.target.closest('.chip-btn'); if (!b) return; $('level').value = b.dataset.v; $('level').dispatchEvent(new Event('change', { bubbles: true })); });
$('level').addEventListener('change', syncLevelChips);
syncLevelChips();

// 起始畫面：Create（網址是 #library 就直接開文章庫）
showView(location.hash.slice(1) === 'library' ? 'library' : 'create', { push: false });
try { history.replaceState({ v: view }, '', '#' + view); } catch { /* 忽略 */ }
