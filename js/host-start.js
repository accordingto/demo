// 新手引導：首頁的開始卡片（沒登入就先輸入存取碼；登入後直接帶去歡迎文章）、第一次閱讀的提示。需在 host-main.js 之後載入。
(function () {
  const card = $('startCard'), login = $('startLogin'), ready = $('startReady'), inp = $('codeHome'), msg = $('codeHomeMsg');
  let kind = 'none', known = false, pending = false;
  const WELCOME_TITLE = 'Welcome to Reading Club!', SEEN = 'rc-welcomed';

  function paint() {
    card.classList.toggle('hidden', !known);
    const needLogin = cloud && kind !== 'ok';   // 雲端模式才需要存取碼；本機模式直接開始
    login.classList.toggle('hidden', !needLogin);
    ready.classList.toggle('hidden', needLogin);
    $('codeHomeGo').disabled = kind === 'busy';
  }
  const showMsg = (t) => { msg.textContent = t; msg.classList.toggle('hidden', !t); };

  // 第一次用這個瀏覽器登入：直接打開歡迎文章；之後登入就去文章庫
  async function afterSignIn(owner) {
    let seen = false; try { seen = !!localStorage.getItem(SEEN); } catch { /* 沒有就當作第一次 */ }
    if (!owner && !seen && cloud) {
      try {
        const { items } = await cloudCall({ action: 'list' });
        const w = items.find((i) => i.title === WELCOME_TITLE);
        if (w) { try { localStorage.setItem(SEEN, '1'); } catch { /* 略過 */ } await openFromLibrary(w.id, 'open'); return; }
      } catch { /* 失敗就去文章庫 */ }
    }
    showView('library');
  }

  document.addEventListener('codestatus', (e) => {
    kind = e.detail.kind; paint();
    if (!pending || kind === 'busy') return;
    pending = false;
    if (kind === 'ok') { showMsg(''); afterSignIn(e.detail.owner); }
    else showMsg(e.detail.msg || 'Incorrect access code');
  });
  document.addEventListener('cloudready', () => { known = true; paint(); });

  login.addEventListener('submit', (e) => {
    e.preventDefault();
    const v = inp.value.trim();
    if (!v) { showMsg('Please type your access code.'); inp.focus(); return; }
    showMsg(''); pending = true;
    $('code').value = v; $('code').dispatchEvent(new Event('change'));   // 和選單裡的欄位同一條路：驗證、記住
  });
  card.addEventListener('click', (e) => {
    const b = e.target.closest('[data-go]'); if (!b) return;
    if (b.dataset.go === 'create') showTab('choose');
    showView(b.dataset.go);
  });
  paint();

  // 第一次閱讀文章：提示怎麼點單字（按「Got it」之後不再出現）
  const HINT = 'rc-hint-read';
  let hintDone = false; try { hintDone = !!localStorage.getItem(HINT); } catch { /* 沒有就顯示 */ }
  window.showReadHint = (show) => $('readHint').classList.toggle('hidden', !show || hintDone);
  $('readHintOk').addEventListener('click', () => { hintDone = true; try { localStorage.setItem(HINT, '1'); } catch { /* 略過 */ } $('readHint').classList.add('hidden'); });
})();
