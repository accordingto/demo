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

// 主題靈感：點一下填進主題欄（每次隨機挑 5 個）
const IDEAS = ['the history of coffee', 'why we dream', 'how vaccines work', 'a day in Tokyo', 'electric cars', 'how bees communicate', 'the future of AI', 'friendship across cultures', 'the science of sleep', 'street food around the world'];
$('suggest').innerHTML = IDEAS.sort(() => Math.random() - 0.5).slice(0, 5).map((t) => `<button type="button" class="sg">${esc(t)}</button>`).join('');
$('suggest').addEventListener('click', (e) => { const b = e.target.closest('.sg'); if (!b) return; $('topic').value = b.textContent; $('topic').dispatchEvent(new Event('input', { bubbles: true })); $('topic').focus(); });


// 起始畫面：Create（網址是 #library 就直接開文章庫）
showView(location.hash.slice(1) === 'create' ? 'create' : 'library', { push: false });   // 預設進入 Library
try { history.replaceState({ v: view }, '', '#' + view); } catch { /* 忽略 */ }

// 這組存取碼是誰：擁有者才有「Manage users」（host-users.js）；並顯示今天 AI 產生還剩幾次（4 / 5）
async function refreshRole() {
  const code = $('code').value.trim(); let owner = false, gen = null;
  if (code) { try { const j = await postJson('/api/library', { action: 'whoami', code }); owner = !!j.owner; gen = j.generate; } catch { /* 碼不對或連不上：當作不是擁有者、不顯示次數 */ } }
  setOwner(owner);
  const box = $('genUsage');
  box.classList.toggle('hidden', !gen);
  if (gen) {
    box.classList.toggle('out', gen.remaining === 0);
    box.innerHTML = `<b>${gen.remaining} / ${gen.limit}</b> AI articles left today` + (gen.remaining === 0 ? ' — resets at midnight (Taipei time)' : '');
    $('go').disabled = gen.remaining === 0;
  } else $('go').disabled = false;
}
$('code').addEventListener('change', refreshRole);
refreshRole();
