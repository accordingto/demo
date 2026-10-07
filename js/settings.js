// 閱讀設定視窗（齒輪）：電子書閱讀器常見的設定。需先載入 prefs.js；頁面上所有 .gear 按鈕都會開關這個視窗
(function () {
  const P = window.Prefs;
  const pct = (v) => Math.round(v * 100) + '%';
  const em = (v) => (v === 0 ? 'None' : v + ' em');

  // 設定項目：type = seg（分段按鈕）｜range（滑桿）｜toggle（開關）
  const SECTIONS = [
    { title: 'Text', items: [
      { key: 'fs', label: 'Text size', type: 'range', min: 12, max: 40, step: 1, show: (v) => v + ' px', stepper: 2 },
      { key: 'font', label: 'Font', type: 'fonts' },
      { key: 'lh', label: 'Line spacing', type: 'range', min: 1.2, max: 2.6, step: 0.1, show: (v) => v.toFixed(1) },
      { key: 'para', label: 'Paragraph spacing', type: 'range', min: 0, max: 2, step: 0.25, show: em },
      { key: 'ls', label: 'Letter spacing', type: 'range', min: 0, max: 0.12, step: 0.01, show: (v) => (v === 0 ? 'Normal' : v.toFixed(2) + ' em') },
      { key: 'measure', label: 'Text width', type: 'seg', options: [['narrow', 'Narrow'], ['medium', 'Medium'], ['wide', 'Wide'], ['full', 'Full']] },
      { key: 'align', label: 'Alignment', type: 'seg', options: [['left', 'Left'], ['justify', 'Justified']] },
    ] },
    { title: 'Display', items: [
      { key: 'dim', label: 'Dim screen', type: 'range', min: 0, max: 0.6, step: 0.05, show: (v) => (v === 0 ? 'Off' : pct(v)) },
      { key: 'warm', label: 'Warm light (reduce blue)', type: 'range', min: 0, max: 0.6, step: 0.05, show: (v) => (v === 0 ? 'Off' : pct(v)) },
      { key: 'hl', label: 'Mark vocabulary words in the text', type: 'toggle' },
      { key: 'hlColor', label: 'Vocabulary word color', type: 'color' },
      { key: 'anim', label: 'Animations', type: 'toggle' },
    ] },
    { title: 'Pronunciation', items: [
      { key: 'speak', label: 'Pronounce words on tap', type: 'toggle' },
      { key: 'accent', label: 'Accent', type: 'seg', options: [['us', 'American'], ['uk', 'British']] },
      { key: 'rate', label: 'Speed', type: 'range', min: 0.5, max: 1.2, step: 0.05, show: (v) => v.toFixed(2) + '×' },
    ] },
  ];

  const COLORS = ['#4f8cff', '#2fbf71', '#f2c230', '#ff7a59', '#e0559c', '#9b6bff'];   // 預設的幾個顏色；也可用調色盤選任何顏色
  const row = (it, body) => `<div class="srow" data-key="${it.key}"><div class="slabel"><span>${it.label}</span><span class="sval" data-val="${it.key}"></span></div>${body}</div>`;
  function control(it) {
    if (it.type === 'range') {
      const step = it.stepper ? `<button type="button" class="secondary sstep" data-step="-${it.stepper}" aria-label="Smaller">A−</button>` : '';
      const step2 = it.stepper ? `<button type="button" class="secondary sstep" data-step="${it.stepper}" aria-label="Larger">A+</button>` : '';
      return row(it, `<div class="srange">${step}<input type="range" data-k="${it.key}" min="${it.min}" max="${it.max}" step="${it.step}" aria-label="${it.label}">${step2}</div>`);
    }
    if (it.type === 'seg') return row(it, `<div class="seg" role="group" aria-label="${it.label}">${it.options.map(([v, l]) => `<button type="button" class="secondary" data-k="${it.key}" data-v="${v}">${l}</button>`).join('')}</div>`);
    if (it.type === 'toggle') return `<label class="srow stoggle" data-key="${it.key}"><span>${it.label}</span><input type="checkbox" data-k="${it.key}" role="switch"></label>`;
    if (it.type === 'color') return row(it, `<div class="colors" role="group" aria-label="${it.label}">${COLORS.map((c) => `<button type="button" class="cdot" data-k="hlColor" data-v="${c}" style="background:${c}" aria-label="${c}"></button>`).join('')}<input type="color" id="hlPick" data-k="hlColor" aria-label="Pick any color"><button type="button" class="secondary cdef" data-k="hlColor" data-v="">Theme default</button></div>`);
    if (it.type === 'fonts') return row(it, `<div class="fontgrid">${Object.entries(P.FONTS).map(([id, f]) => `<button type="button" class="secondary" data-k="font" data-v="${id}" style="font-family:${f.css.replace(/"/g, "'")}">${f.label}</button>`).join('')}</div>`);
    return '';
  }
  const themes = `<section><h4>Theme</h4><div class="themes" role="group" aria-label="Theme">${P.THEMES.map((t) =>
    `<button type="button" class="swatch" data-k="theme" data-v="${t.id}" style="--sw-bg:${t.bg};--sw-ink:${t.ink};--sw-hl:${t.hl}" aria-label="${t.label} theme"><span class="sw-a">Aa</span><span class="sw-n">${t.label}</span></button>`).join('')}</div></section>`;

  // 最上面第一項：一開始先開哪一頁（只有主持人頁有；閱讀頁沒有側邊欄就不顯示）。存在 localStorage 的 rc-start，host-nav.js 的 startView() 讀它
  const START_KEY = 'rc-start', hostPage = !!document.getElementById('sidebar');
  const startRow = hostPage ? '<section class="sstart"><label class="srow stoggle"><span>Open the Library first</span><input type="checkbox" id="startLib" role="switch"></label></section>' : '';

  const panel = document.createElement('div');
  panel.id = 'settings'; panel.className = 'hidden'; panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-label', 'Reading settings');
  panel.innerHTML =
    '<div class="shead"><b>⚙ Reading settings</b><span><button type="button" class="secondary" id="sReset">Reset</button><button type="button" class="sclose" id="sClose" aria-label="Close">×</button></span></div>' +
    '<div class="sbody">' + startRow + themes + SECTIONS.map((s) => `<section><h4>${s.title}</h4>${s.items.map(control).join('')}${s.title === 'Pronunciation' ? '<button type="button" class="secondary" id="sTest">▶ Test pronunciation</button><div id="sTestMsg" class="stestmsg" role="status"></div>' : ''}</section>`).join('') + '</div>';
  document.body.appendChild(panel);

  // 把目前設定顯示到畫面上
  function sync() {
    const p = P.get();
    panel.querySelectorAll('[data-k][data-v]').forEach((b) => { const on = String(p[b.dataset.k]) === b.dataset.v; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on); });
    panel.querySelectorAll('input[type=range]').forEach((i) => { i.value = p[i.dataset.k]; });
    panel.querySelectorAll('input[type=checkbox][data-k]').forEach((i) => { i.checked = !!p[i.dataset.k]; });
    const sl = panel.querySelector('#startLib'); if (sl) { try { sl.checked = localStorage.getItem(START_KEY) === 'library'; } catch { sl.checked = false; } }
    const hlRow = panel.querySelector('[data-key="hlColor"]');
    if (hlRow) { hlRow.classList.toggle('off', !p.hl); hlRow.querySelectorAll('button, input').forEach((x) => { x.disabled = !p.hl; }); }   // 沒勾選「標示單字」時，顏色設定停用
    const pick = panel.querySelector('#hlPick'); if (pick) pick.value = p.hlColor || '#4f8cff';
    panel.querySelectorAll('.colors button[data-k]').forEach((b) => { const on = b.dataset.v === p.hlColor; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on); });
    SECTIONS.forEach((s) => s.items.forEach((it) => { if (it.show) panel.querySelector(`[data-val="${it.key}"]`).textContent = it.show(p[it.key]); }));
  }
  P.onChange(sync); sync();

  panel.addEventListener('change', (e) => {   // 「先開啟文章庫」開關
    if (e.target.id === 'startLib') { try { localStorage.setItem(START_KEY, e.target.checked ? 'library' : 'help'); } catch { /* 存不了就只在這次有效 */ } }
  });
  panel.addEventListener('input', (e) => {
    const t = e.target, k = t.dataset.k; if (!k) return;
    if (t.type === 'range') P.set({ [k]: Number(t.value) });
    else if (t.type === 'checkbox') P.set({ [k]: t.checked });
    else if (t.type === 'color') P.set({ hlColor: t.value });
  });
  panel.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.id === 'sClose') return toggle(false);
    if (b.id === 'sReset') return P.reset();
    if (b.id === 'sTest') return testSpeech();
    if (b.dataset.step) return P.set({ fs: P.get('fs') + Number(b.dataset.step) });
    if (b.dataset.k) P.set({ [b.dataset.k]: b.dataset.v });
  });

  // 發音測試：顯示語音引擎實際回報了什麼，方便找出沒聲音的原因
  function testSpeech() {
    const msg = panel.querySelector('#sTestMsg'), i = TTS.info();
    const base = `Voices found: ${i.voices} · using: ${i.voice}`;
    if (!i.canSpeak) { msg.className = 'stestmsg err'; msg.textContent = 'This browser does not support speech synthesis.'; return; }
    let answered = false;
    const show = (cls, t) => { msg.className = 'stestmsg ' + cls; msg.textContent = t + '\n' + base; };
    show('', 'Starting…');
    const timer = setTimeout(() => { if (!answered) show('err', 'The speech engine did not respond. Check that the silent switch is off, the volume is up, and a voice is installed (iPhone/iPad: Settings → Accessibility → Spoken Content → Voices).'); }, 2500);
    Vocab.speakSample({
      start: () => { answered = true; clearTimeout(timer); show('ok', 'Playing…'); },
      end: () => { answered = true; clearTimeout(timer); show('ok', 'Done. If you heard nothing, check the silent switch and volume.'); },
      error: (e) => { answered = true; clearTimeout(timer); show('err', `Speech error: ${e}. ` + (e === 'not-allowed' ? 'The browser blocked it — tap the button again.' : e === 'synthesis-failed' || e === 'voice-unavailable' ? 'No usable voice: install an English voice in the device settings.' : '')); },
    });
  }

  const gears = [...document.querySelectorAll('.gear')];
  const onGear = (t) => gears.some((g) => g.contains(t));
  function toggle(open) {
    open = open === undefined ? panel.classList.contains('hidden') : open;
    panel.classList.toggle('hidden', !open);
    gears.forEach((g) => g.setAttribute('aria-expanded', open));
    if (open) panel.querySelector('.swatch.on, button')?.focus({ preventScroll: true });
  }
  gears.forEach((g) => g.addEventListener('click', () => toggle()));
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !panel.classList.contains('hidden')) { toggle(false); gears.find((g) => g.offsetParent)?.focus(); } });
  document.addEventListener('pointerdown', (e) => { if (!panel.classList.contains('hidden') && !panel.contains(e.target) && !onGear(e.target)) toggle(false); });
})();
