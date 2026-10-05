// 閱讀偏好：主題、文字、顯示、發音。放在 <head> 先載入，頁面繪製前就套用（避免閃一下預設主題）
// window.Prefs：get(key)、set({…})、reset()、defaults、THEMES、FONTS（設定視窗 js/settings.js 使用）
(function () {
  const KEY = 'rc-prefs';
  const reduced = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
  const DEFAULTS = {
    theme: 'light',           // 色彩主題（預設 Light）
    fs: 18, font: 'sans', lh: 1.8, para: 1, ls: 0, measure: 'full', align: 'left',   // 文字
    hl: true, anim: !reduced, dim: 0, warm: 0,                                      // 顯示
    speak: true, rate: 0.85, accent: 'us',                                          // 發音
  };
  const THEMES = [
    { id: 'dark', label: 'Dark', bg: '#14171c', ink: '#e6e8eb', hl: '#4fb89a' },
    { id: 'night', label: 'Night', bg: '#000000', ink: '#cfcfcf', hl: '#4fb89a' },
    { id: 'gray', label: 'Gray', bg: '#2b2d31', ink: '#e3e5e8', hl: '#5cc4a6' },
    { id: 'light', label: 'Light', bg: '#ffffff', ink: '#111418', hl: '#0f766e' },
    { id: 'paper', label: 'Paper', bg: '#f4eedd', ink: '#161616', hl: '#7a5a2e' },
    { id: 'sepia', label: 'Sepia', bg: '#f6ecd5', ink: '#4a3826', hl: '#9a6428' },
    { id: 'contrast', label: 'Contrast', bg: '#000000', ink: '#ffe600', hl: '#ffe600' },
  ];
  const FONTS = {
    sans: { label: 'Sans', css: '-apple-system, "Noto Sans TC", "PingFang TC", "Segoe UI", sans-serif' },
    serif: { label: 'Serif', css: 'Georgia, "Noto Serif TC", "Songti TC", "Times New Roman", serif' },
    readable: { label: 'Wide', css: 'Verdana, "Trebuchet MS", "Noto Sans TC", sans-serif' },
    friendly: { label: 'Friendly', css: '"OpenDyslexic", "Comic Sans MS", "Chalkboard SE", "Comic Neue", "Noto Sans TC", sans-serif' },
    mono: { label: 'Mono', css: 'ui-monospace, "SF Mono", Menlo, Consolas, "Noto Sans Mono", monospace' },
  };
  const MEASURES = { narrow: '34rem', medium: '44rem', wide: '58rem', full: 'none' };
  const ONE_OF = (v, list, d) => (list.includes(v) ? v : d);
  const NUM = (v, lo, hi, d) => { v = Number(v); return Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d; };

  function clean(o) {   // 只接受合法的值，其餘用預設
    o = o && typeof o === 'object' ? o : {};
    const d = DEFAULTS;
    return {
      theme: ONE_OF(o.theme, THEMES.map((t) => t.id), d.theme),
      fs: Math.round(NUM(o.fs, 12, 40, d.fs)), font: ONE_OF(o.font, Object.keys(FONTS), d.font),
      lh: NUM(o.lh, 1.2, 2.6, d.lh), para: NUM(o.para, 0, 2, d.para), ls: NUM(o.ls, 0, 0.12, d.ls),
      measure: ONE_OF(o.measure, Object.keys(MEASURES), d.measure), align: ONE_OF(o.align, ['left', 'justify'], d.align),
      hl: o.hl === undefined ? d.hl : !!o.hl, anim: o.anim === undefined ? d.anim : !!o.anim,
      dim: NUM(o.dim, 0, 0.6, d.dim), warm: NUM(o.warm, 0, 0.6, d.warm),
      speak: o.speak === undefined ? d.speak : !!o.speak, rate: NUM(o.rate, 0.5, 1.2, d.rate), accent: ONE_OF(o.accent, ['us', 'uk'], d.accent),
    };
  }

  let prefs = load();
  const listeners = [];

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) return clean(JSON.parse(raw));
      const oldFs = Number(localStorage.getItem('rc-fs-host'));   // 舊版只記文字大小
      if (oldFs) return clean({ fs: oldFs });
    } catch { /* 無痕模式或被封鎖時用預設 */ }
    return clean({});
  }
  function apply() {
    const r = document.documentElement, p = prefs, s = r.style;
    r.dataset.theme = p.theme; r.dataset.align = p.align;
    r.dataset.hl = p.hl ? 'on' : 'off'; r.dataset.anim = p.anim ? 'on' : 'off';
    s.setProperty('--fs', p.fs + 'px'); s.setProperty('--lh', p.lh); s.setProperty('--para', p.para + 'em'); s.setProperty('--ls', p.ls + 'em');
    s.setProperty('--align', p.align); s.setProperty('--measure', MEASURES[p.measure]); s.setProperty('--reader-font', FONTS[p.font].css);
    s.setProperty('--dim', p.dim); s.setProperty('--warm', p.warm);
    const meta = document.querySelector('meta[name="theme-color"]') || Object.assign(document.head.appendChild(document.createElement('meta')), { name: 'theme-color' });
    meta.content = (THEMES.find((t) => t.id === p.theme) || THEMES[0]).bg;   // 手機瀏覽器的網址列顏色
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(prefs)); } catch { /* 忽略 */ } }
  function changed() { apply(); listeners.forEach((f) => f(prefs)); }

  window.Prefs = {
    defaults: DEFAULTS, THEMES, FONTS,
    get: (k) => (k ? prefs[k] : { ...prefs }),
    set(patch) { prefs = clean({ ...prefs, ...patch }); save(); changed(); },
    reset() { prefs = clean({}); save(); changed(); },
    onChange: (f) => listeners.push(f),
  };
  apply();
  window.addEventListener('storage', (e) => { if (e.key === KEY) { prefs = load(); changed(); } });   // 另一個分頁改了設定
})();
