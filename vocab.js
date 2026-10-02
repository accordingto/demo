// 主持人頁與閱讀頁共用：單字表、雙擊加字、文章標示、字體大小
// 頁面需提供：#doc #bodyText #vocabList #addForm #addInput #vmsg #fsInc #fsDec #fsVal
(function () {
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  let items = [];                 // 單字表項目；locked:true = 主持人挑的字（不可移除）
  let cfg = { getBody: () => '', onChange: () => {} };

  // 詞性：縮寫 → 全名，顯示成 (verb)、(noun)…
  const POS_FULL = { n: 'noun', v: 'verb', vt: 'verb', vi: 'verb', adj: 'adjective', adv: 'adverb', prep: 'preposition', conj: 'conjunction', pron: 'pronoun', det: 'determiner', interj: 'interjection', int: 'interjection', art: 'article', num: 'numeral' };
  const posLabel = (p) => { const k = String(p || '').trim().toLowerCase().replace(/\.$/, ''); return k ? `(${POS_FULL[k] || k})` : ''; };

  // ---- 發音：瀏覽器內建語音合成（免費、不需 API）----
  const canSpeak = !!window.speechSynthesis && typeof window.SpeechSynthesisUtterance === 'function';
  const spkBtn = (w) => canSpeak ? `<button type="button" class="spk" data-say="${esc(w)}" aria-label="Play pronunciation of ${esc(w)}" title="Play pronunciation">🔊</button>` : '';
  function speak(text) {
    if (!canSpeak) return;
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text); u.lang = 'en-US'; u.rate = 0.85;
    const v = speechSynthesis.getVoices().find((x) => /^en[-_]US/i.test(x.lang)); if (v) u.voice = v;
    speechSynthesis.speak(u);
  }

  const clean = (raw) => raw.toLowerCase().replace(/[’‘]/g, "'").replace(/^[^a-z]+|[^a-z]+$/g, '').replace(/\s+/g, ' ');
  function stems(w) { // 可能的原形（markets → market…）
    const out = [w];
    for (const [suf, add] of [['ies', 'y'], ['es', ''], ['s', ''], ['ed', ''], ['ed', 'e'], ['ing', ''], ['ing', 'e'], ['ly', '']]) if (w.length > suf.length + 2 && w.endsWith(suf)) out.push(w.slice(0, -suf.length) + add);
    return out;
  }
  const findItem = (w) => items.find((v) => stems(w).includes(v.word.toLowerCase()));

  // ---- 在主文章上標示：每個字包成 span.w（供雙擊），已加入的字用底色標示（含變化形）----
  let frozen = false; // 就地編輯期間暫停重畫文章（避免打字時內容被覆蓋）
  function paintBody() {
    const el = $('bodyText'); if (!el || frozen) return;
    const keys = new Set();
    items.forEach((v) => { keys.add(v.word.toLowerCase()); if (v.lemma) keys.add(v.lemma.toLowerCase()); });

    // 網址（http/https/www.）→ 可點擊的連結（新分頁開啟）。先把網址換成佔位符，避免被拆成單字或被句號切句
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
    // 每個句子包成 span.s（點單字表時可整句標示）；句子內每個字包成 span.w / mark.vh
    const sentences = (p) => (p.match(/[^.!?]+(?:[.!?]+["'”’)]*)?\s*/g) || [p]).filter((x) => x.length);
    el.innerHTML = String(cfg.getBody() || '').split(/\n\s*\n/).filter((p) => p.trim()).map((p) => {
      const urls = [];
      const masked = p.replace(URL_RE, (m) => { const core = trimUrl(m); urls.push(core); return `\uE000${urls.length - 1}\uE001${m.slice(core.length)}`; });
      return `<p>${sentences(masked).map((st) => `<span class="s">${st.split(/([A-Za-z][A-Za-z’'-]*)/).map((t) => wrap(t, urls)).join('')}</span>`).join('')}</p>`;
    }).join('');
  }

  // ---- 點單字表的某個字 → 文章中這個字的每一處（含整句）特別標示，並可逐一跳到每一處 ----
  let active = null; // { key: 單字（小寫）, idx: 目前是第幾處 }
  const keysOf = (v) => new Set([v.word.toLowerCase(), v.lemma ? v.lemma.toLowerCase() : ''].filter(Boolean));
  const marksOf = (v) => { const ks = keysOf(v); return [...document.querySelectorAll('#bodyText mark.vh')].filter((m) => stems(clean(m.textContent)).some((k) => ks.has(k))); };
  const activeItem = () => (active ? items.find((x) => x.word.toLowerCase() === active.key) : null);
  function applyActive() {
    document.querySelectorAll('#bodyText .cur, #bodyText .now, #bodyText .s.hit').forEach((e) => e.classList.remove('cur', 'now', 'hit'));
    document.querySelectorAll('#vocabList li.active').forEach((e) => e.classList.remove('active'));
    const bar = $('hlbar'), v = activeItem();
    if (!v) { active = null; if (bar) bar.classList.add('hidden'); return; }
    const ms = marksOf(v);
    const li = [...document.querySelectorAll('#vocabList li')].find((x) => x.dataset.w === active.key); if (li) li.classList.add('active');
    if (bar) {
      bar.classList.remove('hidden');
      if (!ms.length) { $('hlText').textContent = `“${v.word}” does not appear in the text.`; $('hlPrev').classList.add('hidden'); $('hlNext').classList.add('hidden'); return; }
      $('hlPrev').classList.toggle('hidden', ms.length < 2); $('hlNext').classList.toggle('hidden', ms.length < 2);
    }
    active.idx = ((active.idx % ms.length) + ms.length) % ms.length;
    ms.forEach((m, i) => { m.classList.add('cur'); m.closest('.s')?.classList.add('hit'); if (i === active.idx) m.classList.add('now'); });
    if (bar) $('hlText').textContent = `“${v.word}” ${active.idx + 1} / ${ms.length}`;
  }
  function scrollToNow() { document.querySelector('#bodyText mark.now')?.scrollIntoView({ block: 'center', behavior: 'smooth' }); }
  function pick(v, idx) { // idx 未指定：同一個字再點就跳到下一處；換字則從第一處開始
    if (idx === undefined) idx = active && active.key === v.word.toLowerCase() ? active.idx + 1 : 0;
    active = { key: v.word.toLowerCase(), idx };
    applyActive(); scrollToNow();
  }
  function step(d) { if (active) { active.idx += d; applyActive(); scrollToNow(); } }

  // ---- 單字卡：剛加入時展開，查完 5 秒後自動收成第一行（單字、音標、發音）；點卡片或箭頭再展開 ----
  const AUTO_COLLAPSE_MS = 5000;
  function reveal(v, pin) { // 展開；pin = 使用者主動展開，不會自動收起
    clearTimeout(v._t); v.open = true; if (pin) v.pinned = true;
    if (!v.pinned && !v.loading && !v.failed) v._t = setTimeout(() => { if (!v.pinned && items.includes(v)) { v.open = false; renderVocab(); } }, AUTO_COLLAPSE_MS);
  }
  function collapse(v) { clearTimeout(v._t); v.open = false; v.pinned = false; }

  function renderVocab() {
    paintBody();
    $('vocabList').innerHTML = items.length ? items.map((v) => {
      const k = esc(v.word.toLowerCase());
      const open = !!(v.open || v.loading || v.failed); // 查詢中與失敗時一定展開，才看得到狀態
      const detail = v.loading ? '<div class="def">Looking up…</div>'
        : v.failed ? `<div class="def">${esc(v.err || 'Lookup failed')} — click to retry</div>`
        : `<div class="def">${v.pos ? `<span class="pos">${esc(posLabel(v.pos))}</span> ` : ''}${esc(v.definition || '(no definition)')}</div>${v.zh ? `<div class="zhl">${esc(v.zh)}</div>` : ''}`;
      return `<li data-w="${k}" class="${v.failed ? 'fail' : ''} ${open ? 'open' : 'closed'}">${v.locked ? '' : `<button type="button" class="del" data-del="${k}" aria-label="Remove ${esc(v.word)}" title="Remove">×</button>`}` +
        `<div class="v1"><button type="button" class="tg" aria-expanded="${open}" aria-label="${open ? 'Collapse' : 'Expand'} ${esc(v.word)}" title="${open ? 'Collapse' : 'Expand'}">${open ? '▾' : '▸'}</button>` +
        `<b>${esc(v.word)}</b>${v.kk ? `<span class="kk">${esc(v.kk)}</span>` : ''}${spkBtn(v.word)}${open && v.lemma ? `<span class="lem">← ${esc(v.lemma)}</span>` : ''}</div>` +
        `${open ? `<div class="vdet">${detail}</div>` : ''}</li>`;
    }).join('') : '<li class="empty">No words yet. Double-click (or double-tap) a word in the article, or type one above.</li>';
    applyActive();
    cfg.onChange(items);
  }

  // 找出文章中含該字的句子，當作查詢的上下文（讓 AI 依語境給出正確意思）
  function sentenceOf(text, word) {
    const re = new RegExp('\\b' + word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'i');
    return ((text || '').match(/[^.!?\n]+[.!?]*/g) || []).find((x) => re.test(x))?.trim().slice(0, 300) || '';
  }
  async function fillWord(v) { // 呼叫後端 /api/define（Groq）：詞性、KK 音標、英文解釋、中文翻譯
    v.loading = true; v.failed = false; renderVocab();
    try {
      const r = await fetch('/api/define', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ word: v.word, context: v.ctx || sentenceOf(cfg.getBody(), v.word) }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || `Lookup failed (${r.status})`);
      Object.assign(v, { pos: j.pos || '', kk: j.kk || '', definition: j.definition || '', zh: j.zh || '', lemma: j.lemma && j.lemma.toLowerCase() !== v.word.toLowerCase() ? j.lemma : '', err: '' });
    } catch (e) { v.failed = true; v.err = e.message; }
    v.loading = false;
    if (v.open) reveal(v); // 查詢完成 → 開始 5 秒倒數（使用者已手動展開的不會收）
    renderVocab();
  }
  function flash(v) { // 單字表中對應的項目短暫反白，並捲到可見位置
    const li = [...document.querySelectorAll('#vocabList li')].find((x) => x.dataset.w === v.word.toLowerCase()); if (!li) return;
    li.classList.add('on'); li.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); setTimeout(() => li.classList.remove('on'), 1800);
  }
  function addWord(raw) {
    const w = clean(raw);
    if (w.length < 2 || w.length > 40) { $('vmsg').textContent = 'Please select a single word.'; return; }
    const exist = findItem(w);
    if (exist) { $('vmsg').textContent = `“${exist.word}” is already in the list.`; reveal(exist); renderVocab(); flash(exist); return; }
    const v = { word: w, pos: '', definition: '', zh: '', kk: '', lemma: '', ctx: sentenceOf(cfg.getBody(), w), open: true };
    items.push(v); $('vmsg').textContent = `Added “${w}”.`;
    renderVocab(); flash(v); fillWord(v);
  }

  // ---- 文章字體大小（即時生效，記在這個瀏覽器）----
  let fs = 18;
  try { fs = Number(localStorage.getItem('rc-fs-host')) || 18; } catch {}
  function setFs(n) {
    fs = Math.min(36, Math.max(12, n));
    document.documentElement.style.setProperty('--fs', fs + 'px'); $('fsVal').textContent = fs + 'px';
    try { localStorage.setItem('rc-fs-host', fs); } catch {}
  }

  // ---- 事件 ----
  function bind() {
    $('fsInc').onclick = () => setFs(fs + 2);
    $('fsDec').onclick = () => setFs(fs - 2);
    setFs(fs);
    // 點文章中的單字：
    //  • 點一下 → 發音（文章上出現的原樣，例如 called）；若是已標示的字，單字庫中對應的項目也會反白並捲到可見位置
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
        addWord(word);
        return;
      }
      last = { text: key, t: now };
      speak(word);
      if (!w.matches('mark.vh')) return;
      const v = findItem(key) || items.find((x) => x.lemma && stems(key).includes(x.lemma.toLowerCase()));
      if (v) { reveal(v); renderVocab(); flash(v); pick(v, marksOf(v).indexOf(w)); } // 同時選取這個單字，標示文章中所有出現的位置
    });
    $('addForm').addEventListener('submit', (e) => { e.preventDefault(); const i = $('addInput'); if (i.value.trim()) addWord(i.value); i.value = ''; });
    $('vocabList').addEventListener('click', (e) => {
      const sp = e.target.closest('.spk'); if (sp) return speak(sp.dataset.say);
      const del = e.target.closest('.del'); if (del) { items = items.filter((v) => v.word.toLowerCase() !== del.dataset.del); renderVocab(); return; }
      const failed = e.target.closest('li.fail'); if (failed) { const v = items.find((x) => x.word.toLowerCase() === failed.dataset.w); if (v) fillWord(v); return; }
      const tgl = e.target.closest('.tg');
      if (tgl) { // 箭頭：只負責展開／收起
        const v = items.find((x) => x.word.toLowerCase() === tgl.closest('li').dataset.w);
        if (v) { if (v.open) collapse(v); else reveal(v, true); renderVocab(); }
        return;
      }
      const li = e.target.closest('li[data-w]');
      if (li) {
        const v = items.find((x) => x.word.toLowerCase() === li.dataset.w); if (!v) return;
        if (!v.open) { reveal(v, true); renderVocab(); pick(v, 0); } // 收起的卡片 → 展開，並標示文章中的位置
        else { reveal(v, true); pick(v); }                           // 已展開 → 跳到文章中的下一處
      }
    });
    if ($('hlPrev')) { $('hlPrev').onclick = () => step(-1); $('hlNext').onclick = () => step(1); $('hlClear').onclick = () => { active = null; applyActive(); }; }
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && active) { active = null; applyActive(); } });
  }

  window.Vocab = {
    init(c) { cfg = { ...cfg, ...c }; bind(); renderVocab(); },
    getItems: () => items,
    setItems(list) { items.forEach((x) => clearTimeout(x._t)); items = (list || []).map(({ word, pos, definition, zh, kk, lemma, locked, ctx }) => ({ word, pos, definition, zh, kk, lemma, locked, ctx })); active = null; $('vmsg').textContent = ''; renderVocab(); },
    repaint: renderVocab,
    freeze(on) { frozen = !!on; },
    sentenceOf, fillWord,
  };
})();
