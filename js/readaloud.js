// 朗讀文章：標題右上角的 ▶ 朗讀全文，以及每個段落前面的 ▶ 從該段開始往下念。朗讀中按鈕變成 ⏸，再按暫停／繼續。
// 需先載入 prefs.js、tts.js、vocab.js。暫停 = 停在目前這一句，繼續時從這一句重新念（各平台的 pause/resume 不可靠，所以不用）。
(function () {
  const allBtns = [...document.querySelectorAll('.readall')];
  if (!window.TTS || !TTS.canSpeak) { document.documentElement.dataset.tts = 'off'; allBtns.forEach((b) => b.classList.add('hidden')); window.ReadAloud = { stop() {}, refresh() {} }; return; }

  const ICON = {
    play: '<svg viewBox="0 0 24 24" width="1em" height="1em" aria-hidden="true"><path d="M8 5.5v13l11-6.5z" fill="currentColor"/></svg>',
    pause: '<svg viewBox="0 0 24 24" width="1em" height="1em" aria-hidden="true"><path d="M7 5h4v14H7zM13 5h4v14h-4z" fill="currentColor"/></svg>',
  };
  const URL_RE = /\b(?:https?:\/\/|www\.)[^\s<>"“”]+/gi;
  const WORD_RE = /[A-Za-z][A-Za-z’'-]*/g;   // 和 vocab.js 切字的規則相同：每個字對應畫面上一個 span.w（網址念成 link，對應 a.ulink）
  const speechText = (sentence) => sentence.replace(URL_RE, ' link ');

  // 估算語速：「每秒念幾個字元」，依語音＋語速分開記（語速不是線性的：0.5 倍不一定剛好慢一半），存在瀏覽器裡
  const CPS_KEY = 'rc-tts-cps';
  const voiceKey = () => { try { return (TTS.info && TTS.info().voice) || ''; } catch { return ''; } };
  const readCps = () => { try { return JSON.parse(localStorage.getItem(CPS_KEY) || '{}'); } catch { return {}; } };
  function cps(rate) {
    const o = readCps(), k = voiceKey() + '|' + rate;
    if (o[k]) return o[k];
    const other = Object.keys(o).find((x) => x.startsWith(voiceKey() + '|'));   // 這個語速沒量過：用同一個語音量過的速度按比例推
    return other ? o[other] * rate / +other.split('|')[1] : 17 * rate;
  }
  function calibrate(v, rate) {   // v：這一句實際的每秒字元數
    if (!(v > 2 && v < 80)) return;
    const o = readCps(), k = voiceKey() + '|' + rate;
    o[k] = o[k] ? o[k] * 0.5 + v * 0.5 : v;
    try { localStorage.setItem(CPS_KEY, JSON.stringify(o)); } catch { /* 無痕模式存不了就算了 */ }
  }

  let st = { status: 'idle', p: 0, s: 0, w: -1 };   // status：idle｜playing｜paused；p／s／w＝目前段落／句子／字
  let keep = null;      // 目前這句的語音物件
  let gen = 0;          // 每次開始、暫停、停止都加一；舊的語音事件看到 gen 不同就忽略
  let signature = '';   // 開始朗讀時的文章內容；文章被換掉或編輯就停止

  const paras = () => Vocab.paragraphs();
  const sentenceLists = () => Vocab.paragraphSentences();   // 每個段落的句子，和畫面上的 span.s 一一對應
  const isCurrent = (i) => st.status !== 'idle' && st.p === i;

  function refresh() {
    document.querySelectorAll('#bodyText p').forEach((p, i) => {
      const cur = isCurrent(i), playing = cur && st.status === 'playing', b = p.querySelector('.pread'); if (!b) return;
      p.classList.toggle('reading', cur);
      b.innerHTML = playing ? ICON.pause : ICON.play;
      b.setAttribute('aria-label', playing ? 'Pause reading' : cur ? 'Resume reading' : 'Read this paragraph');
      b.title = b.getAttribute('aria-label');
    });
    highlight();
    const allOn = st.status !== 'idle', playingAll = allOn && st.status === 'playing';
    allBtns.forEach((b) => {
      b.innerHTML = playingAll ? ICON.pause : ICON.play;
      const label = playingAll ? 'Pause reading' : allOn ? 'Resume reading the article' : 'Read the whole article aloud';
      b.setAttribute('aria-label', label); b.title = label; b.classList.toggle('on', allOn);
    });
  }

  // 目前念到的句子（底色）與字（變色）
  const sentenceEl = () => document.querySelectorAll('#bodyText p')[st.p]?.querySelectorAll('.s')[st.s];
  function highlight() {
    document.querySelectorAll('#bodyText .speaking').forEach((e) => e.classList.remove('speaking'));
    if (st.status === 'idle') return;
    const se = sentenceEl(); if (!se) return;
    se.classList.add('speaking');
    if (st.w >= 0) se.querySelectorAll('.w, a.ulink')[st.w]?.classList.add('speaking');
  }
  function scrollToCurrent() {   // 目前這句不在畫面內就捲到中間
    const se = sentenceEl(); if (!se) return;
    const r = se.getBoundingClientRect();
    if (r.top < 70 || r.bottom > innerHeight - 30) se.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }

  function speakCurrent() {
    const my = gen, sents = sentenceLists()[st.p] || [];
    if (st.s >= sents.length) return advance(my);
    const text = speechText(sents[st.s]);
    if (!/[A-Za-z0-9]/.test(text)) { st.s++; return speakCurrent(); }   // 只有標點的片段不念
    st.w = -1; highlight(); scrollToCurrent();
    const starts = [...text.matchAll(WORD_RE)].map((m) => [m.index, m.index + m[0].length]);
    const els = sentenceEl()?.querySelectorAll('.w, a.ulink') || [];
    const trackWords = starts.length === els.length;   // 字數對不起來就只標示句子
    const setWord = (i) => { if (my === gen && trackWords && i !== st.w) { st.w = i; highlight(); } };
    const u = TTS.utter(text);
    let gotBoundary = false, timer = 0, t0 = 0;
    const rate = u.rate || Prefs.get('rate'), speed = cps(rate);   // 這一句開始時的語速與估計速度（念到一半改語速不影響這一句）
    // 優先用瀏覽器回報的字邊界；沒有回報（Chrome 的線上語音、部分 Android 語音）就依「每秒念幾個字元」估算，
    // 並用每一句實際念完的時間持續校正，所以語音比預設快或慢都會慢慢對齊
    u.onboundary = (e) => { gotBoundary = true; clearInterval(timer); const i = starts.findIndex(([a, z]) => e.charIndex >= a && e.charIndex < z); if (i >= 0) setWord(i); };
    u.onstart = () => {
      t0 = Date.now();
      if (!trackWords) return;
      setTimeout(() => {
        if (gotBoundary || my !== gen) return;
        setWord(0);
        timer = setInterval(() => {
          if (my !== gen || gotBoundary) return clearInterval(timer);
          const pos = (Date.now() - t0) / 1000 * speed;   // 目前大約念到第幾個字元
          let i = 0; while (i + 1 < starts.length && starts[i + 1][0] <= pos) i++;
          setWord(i);
        }, 50);
      }, 0);
    };
    const done = () => clearInterval(timer);
    u.onend = () => {
      done();
      if (!gotBoundary && t0 && text.length > 12) calibrate(text.length / ((Date.now() - t0) / 1000), rate);
      if (my === gen) { st.s++; speakCurrent(); }
    };
    u.onerror = (e) => { done(); if (my === gen && e.error !== 'canceled' && e.error !== 'interrupted') stop(); };
    keep = u;   // 保留參照：部分瀏覽器會把沒人引用的語音物件回收掉，事件（邊界、結束）就不會觸發
    TTS.say(u);
  }
  function advance(my) {   // 這一段念完：全文模式接著念下一段，否則結束
    if (my !== gen) return;
    if (st.p + 1 < paras().length) { st.p++; st.s = 0; st.w = -1; refresh(); speakCurrent(); } else stop();
  }

  function start(p) {   // 從第 p 段開始，一段接一段念到文章結尾
    TTS.cancel(); gen++;
    signature = paras().join('\n');
    st = { status: 'playing', p, s: 0, w: -1 };
    refresh();
    speakCurrent();
  }
  function pause() { gen++; TTS.cancel(); st.status = 'paused'; st.w = -1; refresh(); }   // 暫停時保留句子底色
  function resume() { TTS.cancel(); gen++; st.status = 'playing'; refresh(); speakCurrent(); }
  function stop() { gen++; TTS.cancel(); st.status = 'idle'; st.w = -1; refresh(); }

  document.addEventListener('click', (e) => {
    const all = e.target.closest('.readall'), one = e.target.closest('.pread');
    if (all) {
      if (st.status !== 'idle') return st.status === 'playing' ? pause() : resume();
      return start(0);
    }
    if (one) {
      const i = [...document.querySelectorAll('#bodyText p')].indexOf(one.closest('p'));
      if (isCurrent(i)) return st.status === 'playing' ? pause() : resume();
      start(i);   // 點某一段的 ▶：從這一段一直念到最後一段
    }
  });
  // 空白鍵：朗讀中暫停、暫停中繼續（在輸入框、按鈕、連結上維持原本的行為；按鈕本身按空白鍵就會觸發點擊）
  document.addEventListener('keydown', (e) => {
    if ((e.key !== ' ' && e.code !== 'Space') || e.ctrlKey || e.metaKey || e.altKey || e.shiftKey || e.defaultPrevented || st.status === 'idle') return;
    if (e.target.closest && e.target.closest('input, textarea, select, button, a, summary, [contenteditable], [role=button]')) return;
    e.preventDefault();
    return st.status === 'playing' ? pause() : resume();
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && st.status !== 'idle') stop(); });
  document.addEventListener('bodypainted', () => { if (st.status !== 'idle' && paras().join('\n') !== signature) stop(); else refresh(); });   // 文章換了或被編輯 → 停止
  window.addEventListener('pagehide', () => TTS.cancel());

  window.ReadAloud = { stop, refresh };
  refresh();
})();
