// 介面語言（英文／繁體中文）。放在 <head>，需先載入 i18n-zh.js。預設英文；選擇記在 localStorage 的 rc-lang。
// 做法：英文是原文，程式與 HTML 照常寫英文；切到中文時，用「整段文字完全相同」（或符合 patterns）的對照翻成中文，
// 並用 MutationObserver 翻譯之後才出現的內容（例如程式動態產生的訊息）。換回英文時還原。沒有對照的字串維持英文。
// 文章內容、標題、單字、使用者名稱等「使用者內容」不翻譯（見 SKIP）。
(function () {
  const KEY = 'rc-lang', Z = window.I18N_ZH || { exact: {}, patterns: [] };
  const ATTRS = ['placeholder', 'title', 'aria-label'];
  const SKIP = '#bodyText, #qa li, .text h2, .t, .v1 b, .kk, .lem, .who, .qtext, [contenteditable], textarea, code, #ipTitle, #ipExcerpt, #ipHost, script, style';
  let lang = 'en';
  try { if (localStorage.getItem(KEY) === 'zh') lang = 'zh'; } catch { /* 沒有就用英文 */ }

  const trCore = (core) => {
    const ex = Z.exact[core]; if (ex !== undefined) return ex;
    for (const [re, rep] of Z.patterns) {
      const m = re.exec(core);
      if (m) return typeof rep === 'function' ? rep(...m, tr) : core.replace(re, rep);
    }
    if (/ [・·] /.test(core)) {   // 「A ・ B ・ C」：每一段各自翻譯
      const parts = core.split(/( [・·] )/), out = parts.map((p, i) => (i % 2 ? p : trCore(p)));
      return out.join('') === core ? core : out.join('');
    }
    return core;
  };
  function tr(s) {   // 翻譯一段字串（保留前後空白）；英文模式、或沒有對照就原樣回傳
    if (lang !== 'zh' || !s) return s;
    const m = /^(\s*)([\s\S]*?)(\s*)$/.exec(String(s)); if (!m[2]) return s;
    const out = trCore(m[2]);
    return out === m[2] ? s : m[1] + out + m[3];
  }

  const done = new WeakMap();   // 文字節點 → { zh: 翻譯後的文字, en: 原文 }
  function xText(node) {
    if (node.parentElement && node.parentElement.closest(SKIP)) return;
    const rec = done.get(node), cur = node.data;
    if (rec && cur === rec.zh) return;      // 已翻譯、沒被程式改過
    const zh = tr(cur);
    if (zh !== cur) { done.set(node, { zh, en: cur }); node.data = zh; } else if (rec) done.delete(node);
  }
  function xAttr(el) {
    for (const a of ATTRS) {
      const v = el.getAttribute && el.getAttribute(a); if (v == null) continue;
      const rec = el.__i18n && el.__i18n[a];
      if (rec && v === rec.zh) continue;
      const zh = tr(v);
      if (zh !== v) { (el.__i18n = el.__i18n || {})[a] = { zh, en: v }; el.setAttribute(a, zh); } else if (rec) delete el.__i18n[a];
    }
  }
  function walk(root) {
    if (root.nodeType === 3) return xText(root);
    if (root.nodeType !== 1 && root.nodeType !== 9) return;
    if (root.nodeType === 1) xAttr(root);
    root.querySelectorAll && root.querySelectorAll('[placeholder],[title],[aria-label]').forEach(xAttr);
    const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let n = w.nextNode(); n; n = w.nextNode()) xText(n);
  }
  function revert() {
    const w = document.createTreeWalker(document, NodeFilter.SHOW_TEXT);
    for (let n = w.nextNode(); n; n = w.nextNode()) { const rec = done.get(n); if (rec) { n.data = rec.en; done.delete(n); } }
    document.querySelectorAll('*').forEach((el) => {
      if (!el.__i18n) return;
      for (const [a, rec] of Object.entries(el.__i18n)) el.setAttribute(a, rec.en);
      el.__i18n = null;
    });
  }

  new MutationObserver((muts) => {
    if (lang !== 'zh') return;
    for (const m of muts) {
      if (m.type === 'childList') m.addedNodes.forEach(walk);
      else if (m.type === 'characterData') xText(m.target);
      else if (m.type === 'attributes') xAttr(m.target);
    }
  }).observe(document, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRS });

  // 瀏覽器內建的對話框（confirm／alert／prompt）也要翻譯
  for (const f of ['alert', 'confirm', 'prompt']) { const native = window[f].bind(window); window[f] = (msg, ...rest) => native(tr(String(msg ?? '')), ...rest); }

  function syncUi() {
    document.documentElement.lang = lang === 'zh' ? 'zh-Hant' : 'en';
    document.querySelectorAll('[data-lang]').forEach((b) => { const on = b.dataset.lang === lang; b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on)); });
  }
  function set(next) {
    next = next === 'zh' ? 'zh' : 'en';
    if (next === lang) return;
    lang = next;
    try { localStorage.setItem(KEY, lang); } catch { /* 存不了就只在這次有效 */ }
    if (lang === 'zh') walk(document.documentElement); else revert();
    syncUi();
    document.dispatchEvent(new Event('langchange'));
  }

  window.I18N = { t: tr, set, get lang() { return lang; }, locale: () => (lang === 'zh' ? 'zh-TW' : 'en-US') };

  document.addEventListener('DOMContentLoaded', () => { if (lang === 'zh') walk(document.documentElement); syncUi(); });
  document.addEventListener('click', (e) => { const b = e.target.closest && e.target.closest('[data-lang]'); if (b) set(b.dataset.lang); });
})();
