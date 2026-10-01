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
  function paintBody() {
    const el = $('bodyText'); if (!el) return;
    const keys = new Set();
    items.forEach((v) => { keys.add(v.word.toLowerCase()); if (v.lemma) keys.add(v.lemma.toLowerCase()); });
    const wrap = (t) => {
      if (!/^[A-Za-z]/.test(t)) return esc(t);
      return stems(clean(t)).some((k) => keys.has(k)) ? `<mark class="vh w">${esc(t)}</mark>` : `<span class="w">${esc(t)}</span>`;
    };
    el.innerHTML = String(cfg.getBody() || '').split(/\n\s*\n/).filter((p) => p.trim()).map((p) => `<p>${p.split(/([A-Za-z][A-Za-z’'-]*)/).map(wrap).join('')}</p>`).join('');
  }

  function renderVocab() {
    paintBody();
    $('vocabList').innerHTML = items.length ? items.map((v) => {
      const k = esc(v.word.toLowerCase());
      const detail = v.loading ? '<div class="def">Looking up…</div>'
        : v.failed ? `<div class="def">${esc(v.err || 'Lookup failed')} — click to retry</div>`
        : `<div class="def">${v.pos ? `<span class="pos">${esc(posLabel(v.pos))}</span> ` : ''}${esc(v.definition || '(no definition)')}</div>${v.zh ? `<div class="zhl">${esc(v.zh)}</div>` : ''}`;
      return `<li data-w="${k}" class="${v.failed ? 'fail' : ''}">${v.locked ? '' : `<button type="button" class="del" data-del="${k}" aria-label="Remove ${esc(v.word)}" title="Remove">×</button>`}` +
        `<b>${esc(v.word)}</b>${v.kk ? `<span class="kk">${esc(v.kk)}</span>` : ''}${spkBtn(v.word)}${v.lemma ? `<span class="lem">← ${esc(v.lemma)}</span>` : ''}${detail}</li>`;
    }).join('') : '<li class="empty">No words yet. Double-click a word in the article, or type one above.</li>';
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
    if (exist) { $('vmsg').textContent = `“${exist.word}” is already in the list.`; flash(exist); return; }
    const v = { word: w, pos: '', definition: '', zh: '', kk: '', lemma: '', ctx: sentenceOf(cfg.getBody(), w) };
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
    // 雙擊文章中的單字（點兩下 / 觸控雙擊）→ 加入；也可手動輸入/貼上
    $('doc').addEventListener('dblclick', (e) => {
      if (!e.target.closest('#bodyText')) return;
      const w = e.target.closest('.w');
      const t = w ? w.textContent : getSelection().toString();
      getSelection()?.removeAllRanges();
      if (t && t.trim()) addWord(t);
    });
    // 點文章中的任何單字 → 發音（文章上出現的原樣，例如 called）；若是已標示的字，也讓單字庫中對應的項目反白、捲到可見位置
    $('doc').addEventListener('click', (e) => {
      if (!e.target.closest('#bodyText')) return;
      const w = e.target.closest('.w'); if (!w) return;
      speak(w.textContent.replace(/^[^A-Za-z]+|[^A-Za-z]+$/g, ''));
      if (!w.matches('mark.vh')) return;
      const c = clean(w.textContent);
      const v = findItem(c) || items.find((x) => x.lemma && stems(c).includes(x.lemma.toLowerCase()));
      if (v) flash(v);
    });
    $('addForm').addEventListener('submit', (e) => { e.preventDefault(); const i = $('addInput'); if (i.value.trim()) addWord(i.value); i.value = ''; });
    $('vocabList').addEventListener('click', (e) => {
      const sp = e.target.closest('.spk'); if (sp) return speak(sp.dataset.say);
      const del = e.target.closest('.del'); if (del) { items = items.filter((v) => v.word.toLowerCase() !== del.dataset.del); renderVocab(); return; }
      const li = e.target.closest('li.fail'); if (li) { const v = items.find((x) => x.word.toLowerCase() === li.dataset.w); if (v) fillWord(v); }
    });
  }

  window.Vocab = {
    init(c) { cfg = { ...cfg, ...c }; bind(); renderVocab(); },
    getItems: () => items,
    setItems(list) { items = (list || []).map((v) => ({ ...v })); $('vmsg').textContent = ''; renderVocab(); },
    repaint: renderVocab,
    sentenceOf, fillWord,
  };
})();
