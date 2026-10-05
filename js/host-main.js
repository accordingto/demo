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
{ const h = location.hash.slice(1); showView(['help', 'create', 'library'].includes(h) ? h : startView(), { push: false }); }   // 一開始：說明頁（或 Open the Library first 打開時的文章庫）
try { history.replaceState({ v: view }, '', location.pathname + location.search + (location.hash === '#' + view ? location.hash : '')); } catch { /* 忽略 */ }   // 第一次進來不寫入 #網址，才不會書籤把「先開哪一頁」的設定蓋掉

// 存取碼的狀態：輸入後（按 Enter 或離開欄位）向後端確認，明確顯示「已登入：名稱」或錯誤原因；並顯示今天 AI 產生還剩幾次（4 / 5）
// 輸入時不會每按一個鍵就檢查（猜錯會被限流計次），只在輸入完成時檢查一次
let roleSeq = 0;
function setCodeStatus(kind, user, owner, msg) {
  const lamp = (c) => `<i class="lamp ${c}" aria-hidden="true"></i>`;   // 綠燈＝成功、紅燈＝失敗、灰燈＝檢查中
  const html = kind === 'ok' ? `${lamp('ok')}✓ Signed in as <b class="who">${esc(user)}</b>${owner ? ' <span class="role">(owner)</span>' : ''}`
    : kind === 'bad' ? `${lamp('bad')}✗ ${esc(msg)}` : kind === 'busy' ? `${lamp('off')}Checking…` : `${lamp('bad')}Not signed in`;   // 還沒輸入存取碼 = 尚未登入 = 紅燈
  document.querySelectorAll('.codestatus').forEach((el) => { el.className = 'codestatus ' + kind; el.innerHTML = html; });
  // 上方列（手機／平板）：燈號＋登入者名稱，點一下開啟存取碼視窗
  $('tbUser').innerHTML = kind === 'ok' ? `<i class="lamp ok" aria-hidden="true"></i><span class="who">${esc(user)}</span>`
    : kind === 'busy' ? '<i class="lamp off" aria-hidden="true"></i>' : '<i class="lamp bad" aria-hidden="true"></i><span class="nosign">Not signed in</span>';
  for (const el of [$('tbKey'), ...document.querySelectorAll('.side-foot')]) { el.classList.toggle('signed', kind === 'ok'); el.classList.toggle('failed', kind === 'bad' || kind === 'none'); }
}
async function refreshRole() {
  const code = $('code').value.trim(), seq = ++roleSeq; let owner = false, gen = null;
  if (!code) setCodeStatus('none');
  else {
    setCodeStatus('busy');
    try {
      const j = await postJson('/api/library', { action: 'whoami', code });
      if (seq !== roleSeq) return;   // 又輸入了新的碼，這次的結果作廢
      owner = !!j.owner; gen = j.generate; setCodeStatus('ok', j.user, owner);
    } catch (e) { if (seq !== roleSeq) return; setCodeStatus('bad', null, false, e.message); }
  }
  setOwner(owner);   // 擁有者才有「Users」（host-users.js）
  const box = $('genUsage');
  box.classList.toggle('hidden', !gen);
  if (gen) {
    box.classList.toggle('out', gen.remaining === 0);
    box.innerHTML = `<b>${gen.remaining} / ${gen.limit}</b> AI articles left today` + (gen.remaining === 0 ? ' — resets at midnight (Taipei time)' : '');
    $('go').disabled = gen.remaining === 0;
  } else $('go').disabled = false;
}
$('tbUser').addEventListener('click', () => $('tbKey').click());
$('code').addEventListener('change', refreshRole);
$('code').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); $('code').dispatchEvent(new Event('change')); } });   // Enter = 輸入完成
refreshRole();
