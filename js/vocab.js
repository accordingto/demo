// 主持人頁與閱讀頁共用：單字表、雙擊加字、文章標示、字體大小
// 需先載入 util.js；頁面需提供：#doc #bodyText #vocabList #vmsg
(function () {
  let items = [];                 // 單字表項目；locked:true = 主持人挑的字（不可移除）
  let cfg = { getBody: () => '', onChange: () => {} };

  // 詞性：縮寫 → 全名，顯示成 (verb)、(noun)…
  const POS_FULL = { n: 'noun', v: 'verb', vt: 'verb', vi: 'verb', adj: 'adjective', adv: 'adverb', prep: 'preposition', conj: 'conjunction', pron: 'pronoun', det: 'determiner', interj: 'interjection', int: 'interjection', art: 'article', num: 'numeral' };
  const posLabel = (p) => { const k = String(p || '').trim().toLowerCase().replace(/\.$/, ''); return k ? `(${POS_FULL[k] || k})` : ''; };

  // ---- 點字發音（語音合成的設定與共用部分在 js/tts.js；設定可關閉）----
  function speak(text, force) {   // force：設定視窗的測試，不管開關
    if (!TTS.canSpeak || (!force && !Prefs.get('speak'))) return;
    window.ReadAloud?.stop();     // 點字時，正在朗讀的段落先停止
    speechSynthesis.cancel();
    speechSynthesis.speak(TTS.utter(text));
  }

  const clean = (raw) => raw.toLowerCase().replace(/[’‘]/g, "'").replace(/^[^a-z]+|[^a-z]+$/g, '').replace(/\s+/g, ' ');
  function stems(w) { // 可能的原形（markets → market…）
    const out = [w];
    for (const [suf, add] of [['ies', 'y'], ['es', ''], ['s', ''], ['ed', ''], ['ed', 'e'], ['ing', ''], ['ing', 'e'], ['ly', '']]) if (w.length > suf.length + 2 && w.endsWith(suf)) out.push(w.slice(0, -suf.length) + add);
    return out;
  }
  const byKey = (k) => items.find((x) => x.word.toLowerCase() === k);   // 以小寫單字找項目
  const findItem = (w) => items.find((v) => stems(w).includes(v.word.toLowerCase()));

  // ---- 在主文章上標示：每個字包成 span.w（供雙擊），已加入的字用底色標示（含變化形）----
  let frozen = false; // 就地編輯期間暫停重畫文章（避免打字時內容被覆蓋）
  function paintBody() {
    const el = $('bodyText'); if (!el || frozen) return;
    const keys = new Set();
    items.forEach((v) => { keys.add(v.word.toLowerCase()); if (v.lemma) keys.add(v.lemma.toLowerCase()); });

    // 網址（http/https/www.）→ 可點擊的連結（新分頁開啟）。先把網址換成佔位符，避免被拆成單字
    const URL_RE = /\b(?:https?:\/\/|www\.)[^\s<>"“”]+/gi;
    const trimUrl = (u) => { // 去掉結尾的標點；結尾的「)」只有在沒有對應的「(」時才去掉
      for (;;) {
        if (/[.,;:!?'’\]}]$/.test(u)) u = u.slice(0, -1);
        else if (u.endsWith(')') && (u.match(/\)/g) || []).length > (u.match(/\(/g) || []).length) u = u.slice(0, -1);
        else return u;
      }
    };
    const linkHtml = (u) => {
      const href = /^www\./i.test(u) ? 'https://' + u : u;
      try { if (!/^https?:$/.test(new URL(href).protocol)) return esc(u); } catch { return esc(u); } // 只允許 http/https
      return `<a class="ulink" href="${esc(href)}" target="_blank" rel="noopener noreferrer">${esc(u)}</a>`;
    };
    const wrap = (t, urls) => {
      if (!/^[A-Za-z]/.test(t)) return esc(t).replace(/\uE000(\d+)\uE001/g, (_, i) => linkHtml(urls[+i]));
      return stems(clean(t)).some((k) => keys.has(k)) ? `<mark class="vh w">${esc(t)}</mark>` : `<span class="w">${esc(t)}</span>`;
    };
    el.innerHTML = String(cfg.getBody() || '').split(/\n\s*\n/).filter((p) => p.trim()).map((p) => {
      const urls = [];
      const masked = p.replace(URL_RE, (m) => { const core = trimUrl(m); urls.push(core); return `\uE000${urls.length - 1}\uE001${m.slice(core.length)}`; });
      return `<p><button type="button" class="pread"></button>${masked.split(/([A-Za-z][A-Za-z’'-]*)/).map((t) => wrap(t, urls)).join('')}</p>`;   // 每個字包成 span.w / mark.vh
    }).join('');
    document.dispatchEvent(new Event('bodypainted'));   // 朗讀按鈕（js/readaloud.js）重新標示目前狀態
  }
  // 文章的段落（純文字），和 paintBody 的分段一致；朗讀用
  const paragraphs = () => String(cfg.getBody() || '').split(/\n\s*\n/).filter((p) => p.trim()).map((p) => p.replace(/\s+/g, ' ').trim());

  // ---- 文章中單字的強調色：把這個字在文章中的每一處標成橘色（不標整句、不捲動）----
  let active = null; // { key: 單字（小寫）, auto: 是否為暫時標示 }
  let autoTimer = 0;
  const keysOf = (v) => new Set([v.word.toLowerCase(), v.lemma ? v.lemma.toLowerCase() : ''].filter(Boolean));
  const marksOf = (v) => { const ks = keysOf(v); return [...document.querySelectorAll('#bodyText mark.vh')].filter((m) => stems(clean(m.textContent)).some((k) => ks.has(k))); };
  const activeItem = () => (active ? byKey(active.key) : null);
  function applyActive() {
    document.querySelectorAll('#bodyText .cur').forEach((e) => e.classList.remove('cur'));
    document.querySelectorAll('#vocabList li.active').forEach((e) => e.classList.remove('active'));
    const v = activeItem();
    if (!v) { active = null; return; }
    marksOf(v).forEach((m) => m.classList.add('cur'));
    [...document.querySelectorAll('#vocabList li')].find((x) => x.dataset.w === active.key)?.classList.add('active');
  }
  function clearActive() { clearTimeout(autoTimer); autoTimer = 0; active = null; applyActive(); }
  // auto = 點文章中的字所觸發的暫時標示：3 秒後，剛展開的單字卡收起、強調色恢復；
  // 窄螢幕則是浮動單字卡消失時（5 秒後）才恢復。點單字卡觸發的（auto=false）會一直保留到下一次點擊
  function highlight(v, auto = false) {
    clearTimeout(autoTimer); autoTimer = 0;
    active = { key: v.word.toLowerCase(), auto };
    applyActive();
    if (auto && !floatingMode()) autoTimer = setTimeout(() => {
      const c = activeItem();
      if (c && !c.pinned && !c.loading && !c.failed) { collapse(c); renderVocab(); }   // 使用者自己展開（固定）的卡片不收
      clearActive();
    }, TAP_CARD_MS);
  }

  // ---- 單字卡：剛加入時展開，查完 5 秒後自動收成第一行（單字、音標、發音）；點卡片再展開 ----
  const AUTO_COLLAPSE_MS = 5000;
  const TAP_MS = 1100;        // 點字光圈的長度（要和 shared.css 的 wordTap 動畫一致）
  const TAP_CARD_MS = 3000;   // 點文章中已加入的字後，單字卡與橘色維持多久才恢復（桌面版）
  const complete = (v) => !!(v.definition && v.zh);   // 英文解釋與中文解釋都有，才算「取得完整資訊」
  const missingText = (v) => [!v.definition && 'English meaning', !v.zh && 'Chinese meaning'].filter(Boolean).join(' and ');
  function reveal(v, pin) { // 展開；pin = 使用者主動展開，不會自動收起，並收起其他卡片
    clearTimeout(v._t); v.open = true; if (pin) { v.pinned = true; collapseOthers(v); }
    if (!v.pinned && !v.loading && !v.failed && complete(v)) v._t = setTimeout(   // 取得完整資訊後才開始 5 秒倒數；缺資訊時保持展開
      () => { if (!v.pinned && items.includes(v)) { v.open = false; renderVocab(); } }, AUTO_COLLAPSE_MS);
  }
  function collapseOthers(v) { // 點開一張卡片時，收起其他已展開的卡片（查詢中、失敗的要留著才看得到狀態）
    items.forEach((o) => { if (o !== v && o.open && !o.loading && !o.failed) collapse(o); });
  }
  function collapse(v) { clearTimeout(v._t); v.open = false; v.pinned = false; }

  // 單字卡的詳細內容（詞性、英文、中文、狀態提示）；清單卡片與浮動卡片共用
  function detailOf(v) {
    const partial = !v.loading && !v.failed && !complete(v);
    return v.loading ? '<div class="def">Looking up…</div>'
      : v.failed ? `<div class="def">${esc(v.err || 'Lookup failed')} — click to retry</div>`
      : `<div class="def">${v.pos ? `<span class="pos">${esc(posLabel(v.pos))}</span> ` : ''}${esc(v.definition || '(no English meaning)')}</div>${v.zh ? `<div class="zhl">${esc(v.zh)}</div>` : '<div class="zhl">(no Chinese meaning)</div>'}${partial ? `<div class="def" style="color:#f0c36d">⚠ Missing ${esc(missingText(v))} — click to retry</div>` : ''}`;
  }

  // ---- 手機／平板直放（單字表排在文章下面，看不到）：加入或點選單字時，從畫面下方浮出單字卡 ----
  const floatingMode = () => narrowQuery.matches;
  let popState = null; // { key, pinned, t }
  let popEl = null;
  function ensurePop() {
    if (popEl) return popEl;
    popEl = document.createElement('div');
    popEl.id = 'wordPop'; popEl.className = 'hidden'; popEl.setAttribute('role', 'dialog'); popEl.setAttribute('aria-live', 'polite');
    document.body.appendChild(popEl);
    popEl.addEventListener('click', (e) => {
      const v = popState && byKey(popState.key); if (!v) return;
      if (e.target.closest('.pclose')) return hidePop();
      if (popState) { popState.pinned = true; clearTimeout(popState.t); popState.t = 0; } // 點卡片 → 固定住，不再自動消失
      speak(v.word);   // 點浮動單字卡 = 發音
      if (v.failed || !complete(v)) fillWord(v);
    });
    return popEl;
  }
  function hidePop() {
    if (popState) clearTimeout(popState.t);
    popState = null; if (popEl) popEl.classList.add('hidden');
    if (active?.auto) clearActive();   // 浮動單字卡消失 → 文章中的強調色一起恢復
  }
  function updatePop() {
    if (!popState) return;
    const v = byKey(popState.key);
    if (!v || !floatingMode()) return hidePop();
    const el = ensurePop();
    el.innerHTML = `<button type="button" class="pclose" aria-label="Close" title="Close">×</button>` +
      `<div class="v1"><b>${esc(v.word)}</b>${v.kk ? `<span class="kk">${esc(v.kk)}</span>` : ''}${v.lemma ? `<span class="lem">← ${esc(v.lemma)}</span>` : ''}</div>` +
      `<div class="vdet">${detailOf(v)}</div>`;
    el.classList.remove('hidden');
    // 英文與中文都拿到之後才開始 5 秒倒數（點過卡片就固定住）
    if (!popState.pinned && !popState.t && !v.loading && !v.failed && complete(v)) popState.t = setTimeout(hidePop, AUTO_COLLAPSE_MS);
  }
  function showPop(v) { // 只在窄螢幕、且是從文章上操作時使用
    if (!floatingMode()) return;
    if (popState) clearTimeout(popState.t);
    popState = { key: v.word.toLowerCase(), pinned: false, t: 0 };
    updatePop();
  }
  narrowQuery.addEventListener?.('change', (e) => { if (!e.matches) hidePop(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && popState) hidePop(); });

  function renderVocab() {
    paintBody();
    $('vocabList').innerHTML = items.length ? items.map((v) => {
      const k = esc(v.word.toLowerCase());
      const partial = !v.loading && !v.failed && !complete(v) && !!(v.open);   // 查完了但缺英文或中文
      const open = !!(v.open || v.loading || v.failed); // 查詢中與失敗時一定展開，才看得到狀態
      const detail = detailOf(v);
      return `<li data-w="${k}" class="${v.failed ? 'fail' : ''} ${partial ? 'partial' : ''} ${open ? 'open' : 'closed'}">${v.locked ? '' : `<button type="button" class="del" data-del="${k}" aria-label="Remove ${esc(v.word)}" title="Remove">×</button>`}` +
        `<div class="v1"><b>${esc(v.word)}</b>${v.kk ? `<span class="kk">${esc(v.kk)}</span>` : ''}${open && v.lemma ? `<span class="lem">← ${esc(v.lemma)}</span>` : ''}</div>` +
        `${open ? `<div class="vdet">${detail}</div>` : ''}</li>`;
    }).join('') : '<li class="empty">No words yet. Double-click a word in the article to add it.</li>';
    applyActive();
    updatePop();
    cfg.onChange(items);
  }

  // 找出文章中含該字的句子，當作查詢的上下文（讓 AI 依語境給出正確意思）
  function sentenceOf(text, word) {
    const re = new RegExp('\\b' + word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'i');
    return ((text || '').match(/[^.!?\n]+[.!?]*/g) || []).find((x) => re.test(x))?.trim().slice(0, 300) || '';
  }
  async function fillWord(v, attempt = 1) { // 呼叫後端 /api/define（Groq）：詞性、KK 音標、英文解釋、中文翻譯
    v.loading = true; v.failed = false; renderVocab();
    try {
      const j = await postJson('/api/define', { word: v.word, context: v.ctx || sentenceOf(cfg.getBody(), v.word) }, 'Lookup failed');
      Object.assign(v, { pos: j.pos || '', kk: j.kk || '', definition: j.definition || '', zh: j.zh || '', lemma: j.lemma && j.lemma.toLowerCase() !== v.word.toLowerCase() ? j.lemma : '', err: '' });
    } catch (e) { v.failed = true; v.err = e.message; }
    if (!v.failed && !complete(v) && attempt < 2) return fillWord(v, attempt + 1); // 缺英文或中文 → 自動重查一次
    v.loading = false;
    if (v.open) reveal(v); // 英文與中文都拿到了才開始 5 秒倒數；沒拿到會保持展開並提示（使用者已手動展開的也不會收）
    renderVocab();
  }
  function flash(v) { // 單字表中對應的項目短暫反白，並捲到可見位置
    const li = [...document.querySelectorAll('#vocabList li')].find((x) => x.dataset.w === v.word.toLowerCase()); if (!li) return;
    li.classList.add('on'); li.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); setTimeout(() => li.classList.remove('on'), 1800);
  }
  function addWord(raw, fromText) {
    const w = clean(raw);
    if (w.length < 2 || w.length > 40) { $('vmsg').textContent = 'Please select a single word.'; return; }
    const exist = findItem(w);
    if (exist) { $('vmsg').textContent = `“${exist.word}” is already in the list.`; if (fromText && floatingMode()) { renderVocab(); showPop(exist); return; } collapseOthers(exist); reveal(exist); renderVocab(); flash(exist); return; }
    const v = { word: w, pos: '', definition: '', zh: '', kk: '', lemma: '', ctx: sentenceOf(cfg.getBody(), w), open: !(fromText && floatingMode()) };
    items.push(v); $('vmsg').textContent = `Added “${w}”.`;
    renderVocab(); if (fromText && floatingMode()) showPop(v); else flash(v);
    fillWord(v);
  }

  // 點到的單字：短暫的光圈與底色（約 1 秒），讓人知道點了哪個字
  // 點擊處理中可能會重畫文章（展開單字卡等），舊的元素會被換掉，所以用「第幾個字」在重畫之後再找出來
  function tapEffect(idx) {
    const el = $('bodyText')?.querySelectorAll('.w')[idx]; if (!el) return;
    el.classList.remove('tap'); void el.offsetWidth;   // 連點時重新播放動畫
    el.classList.add('tap');
    setTimeout(() => el.classList.remove('tap'), TAP_MS);
  }

  // 關閉所有單字卡（含浮動單字卡）並清除文章中的強調色；查詢中、失敗的卡片要留著才看得到狀態。回傳是否有卡片被收起
  function closeAll() {
    hidePop(); clearActive();
    let changed = false;
    items.forEach((o) => { if (o.open && !o.loading && !o.failed) { collapse(o); changed = true; } });
    return changed;
  }

  // ---- 事件 ----
  function bind() {
    // 點文章中的單字：
    //  • 點一下 → 發音（文章上出現的原樣，例如 called）、播放光圈，並關閉所有單字卡；
    //    若是已加入單字庫的字（有底色），改為打開它的單字卡（窄螢幕＝浮動單字卡），並把文章中這個字標成橘色
    //  • 短時間內連點兩下同一個字（滑鼠雙擊／iPad 雙點）→ 加入單字表
    // 這裡自己計時判斷，不依賴 dblclick 事件（iPad 的 Safari 對 dblclick 不可靠）。
    let last = { text: '', t: 0 };
    $('doc').addEventListener('click', (e) => {
      if (!e.target.closest('#bodyText')) return;
      const w = e.target.closest('.w'); if (!w) return;
      const word = w.textContent.replace(/^[^A-Za-z]+|[^A-Za-z]+$/g, '');
      const key = clean(word), now = Date.now();
      if (key && last.text === key && now - last.t < 500) {   // 第二下 → 加入單字表
        last = { text: '', t: 0 };
        getSelection()?.removeAllRanges();
        addWord(word, true);   // 從文章上加入 → 窄螢幕會浮出單字卡
        return;
      }
      last = { text: key, t: now };
      speak(word);
      const wordIdx = [...$('bodyText').querySelectorAll('.w')].indexOf(w);
      const v = w.matches('mark.vh') ? (findItem(key) || items.find((x) => x.lemma && stems(key).includes(x.lemma.toLowerCase()))) : null;
      const closed = closeAll();
      if (v) {
        if (floatingMode()) showPop(v); else reveal(v);
        highlight(v, true);
        renderVocab(); if (!floatingMode()) flash(v);
      } else if (closed) renderVocab();
      setTimeout(() => tapEffect(wordIdx), 0);   // 等這次點擊的處理（可能重畫文章）完成後再播放
    });
    // 點單字表的卡片：發音、展開這張並收起其他張，文章中這個字換成橘色（不移動畫面、不標整句）
    $('vocabList').addEventListener('click', (e) => {
      const del = e.target.closest('.del');
      if (del) {
        if (!confirm(`Remove “${byKey(del.dataset.del)?.word || del.dataset.del}” from the vocabulary list?`)) return;   // 確認後才刪除
        items = items.filter((v) => v.word.toLowerCase() !== del.dataset.del); renderVocab(); return;
      }
      const li = e.target.closest('li[data-w]'); const v = li && byKey(li.dataset.w); if (!v) return;
      const retry = li.matches('li.fail, li.partial.open');   // 查詢失敗或缺資訊 → 點一下重查
      speak(v.word);
      hidePop(); reveal(v, true); highlight(v);   // reveal(pin) 會收起其他卡片
      renderVocab();
      if (retry) fillWord(v);
    });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && active) clearActive(); });   // Esc：清除強調色
  }

  window.Vocab = {
    init(c) { cfg = { ...cfg, ...c }; bind(); renderVocab(); },
    getItems: () => items,
    setItems(list) { items.forEach((x) => clearTimeout(x._t)); clearTimeout(autoTimer); items = (list || []).map(({ word, pos, definition, zh, kk, lemma, locked, ctx }) => ({ word, pos, definition, zh, kk, lemma, locked, ctx })); active = null; $('vmsg').textContent = ''; renderVocab(); },
    repaint: renderVocab,
    freeze(on) { frozen = !!on; if (on) window.ReadAloud?.stop(); },   // 編輯時停止朗讀
    paragraphs,
    fillWord,
    speakSample() { speak('Hello, this is a pronunciation test.', true); },   // 設定視窗的「Test」按鈕
  };
})();
