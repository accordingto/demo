// 朗讀文章：標題右上角的 ▶ 朗讀全文，以及每個段落前面的 ▶ 只朗讀該段。朗讀中按鈕變成 ⏸，再按暫停／繼續。
// 需先載入 prefs.js、tts.js、vocab.js。暫停 = 停在目前這一句，繼續時從這一句重新念（各平台的 pause/resume 不可靠，所以不用）。
(function () {
  const allBtns = [...document.querySelectorAll('.readall')];
  if (!window.TTS || !TTS.canSpeak) { document.documentElement.dataset.tts = 'off'; allBtns.forEach((b) => b.classList.add('hidden')); window.ReadAloud = { stop() {}, refresh() {} }; return; }

  const ICON = {
    play: '<svg viewBox="0 0 24 24" width="1em" height="1em" aria-hidden="true"><path d="M8 5.5v13l11-6.5z" fill="currentColor"/></svg>',
    pause: '<svg viewBox="0 0 24 24" width="1em" height="1em" aria-hidden="true"><path d="M7 5h4v14H7zM13 5h4v14h-4z" fill="currentColor"/></svg>',
  };
  const URL_RE = /\b(?:https?:\/\/|www\.)[^\s<>"“”]+/gi;
  const sentencesOf = (t) => (t.replace(URL_RE, ' link ').match(/[^.!?]+(?:[.!?]+["'”’)]*)?\s*/g) || []).map((x) => x.trim()).filter((x) => /[A-Za-z0-9]/.test(x));

  let st = { status: 'idle', mode: 'all', p: 0, s: 0 };   // status：idle｜playing｜paused；mode：all＝全文｜para＝單段；p／s＝目前段落／句子
  let gen = 0;          // 每次開始、暫停、停止都加一；舊的語音事件看到 gen 不同就忽略
  let signature = '';   // 開始朗讀時的文章內容；文章被換掉或編輯就停止

  const paras = () => Vocab.paragraphs();
  const isCurrent = (i) => st.status !== 'idle' && st.p === i;

  function refresh() {
    document.querySelectorAll('#bodyText p').forEach((p, i) => {
      const cur = isCurrent(i), playing = cur && st.status === 'playing', b = p.querySelector('.pread'); if (!b) return;
      p.classList.toggle('reading', cur);
      b.innerHTML = playing ? ICON.pause : ICON.play;
      b.setAttribute('aria-label', playing ? 'Pause reading' : cur ? 'Resume reading' : 'Read this paragraph');
      b.title = b.getAttribute('aria-label');
    });
    const allOn = st.mode === 'all' && st.status !== 'idle', playingAll = allOn && st.status === 'playing';
    allBtns.forEach((b) => {
      b.innerHTML = playingAll ? ICON.pause : ICON.play;
      const label = playingAll ? 'Pause reading' : allOn ? 'Resume reading the article' : 'Read the whole article aloud';
      b.setAttribute('aria-label', label); b.title = label; b.classList.toggle('on', allOn);
    });
  }

  function scrollToCurrent() {
    const p = document.querySelectorAll('#bodyText p')[st.p]; if (!p) return;
    const r = p.getBoundingClientRect();
    if (r.top < 60 || r.bottom > innerHeight - 20) p.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }

  function speakCurrent() {
    const my = gen, list = paras(), sents = sentencesOf(list[st.p] || '');
    if (st.s >= sents.length) return advance(my);
    const u = TTS.utter(sents[st.s]);
    u.onend = () => { if (my === gen) { st.s++; speakCurrent(); } };
    u.onerror = (e) => { if (my === gen && e.error !== 'canceled' && e.error !== 'interrupted') stop(); };
    speechSynthesis.speak(u);
  }
  function advance(my) {   // 這一段念完：全文模式接著念下一段，否則結束
    if (my !== gen) return;
    if (st.mode === 'all' && st.p + 1 < paras().length) { st.p++; st.s = 0; refresh(); scrollToCurrent(); speakCurrent(); } else stop();
  }

  function start(p, mode) {
    speechSynthesis.cancel(); gen++;
    signature = paras().join('\n');
    st = { status: 'playing', mode, p, s: 0 };
    refresh(); if (mode === 'all') scrollToCurrent();
    speakCurrent();
  }
  function pause() { gen++; speechSynthesis.cancel(); st.status = 'paused'; refresh(); }
  function resume() { speechSynthesis.cancel(); gen++; st.status = 'playing'; refresh(); speakCurrent(); }
  function stop() { gen++; speechSynthesis.cancel(); st.status = 'idle'; refresh(); }

  document.addEventListener('click', (e) => {
    const all = e.target.closest('.readall'), one = e.target.closest('.pread');
    if (all) {
      if (st.status !== 'idle' && st.mode === 'all') return st.status === 'playing' ? pause() : resume();
      return start(0, 'all');
    }
    if (one) {
      const i = [...document.querySelectorAll('#bodyText p')].indexOf(one.closest('p'));
      if (isCurrent(i)) return st.status === 'playing' ? pause() : resume();
      start(i, 'para');
    }
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && st.status !== 'idle') stop(); });
  document.addEventListener('bodypainted', () => { if (st.status !== 'idle' && paras().join('\n') !== signature) stop(); else refresh(); });   // 文章換了或被編輯 → 停止
  window.addEventListener('pagehide', () => speechSynthesis.cancel());

  window.ReadAloud = { stop, refresh };
  refresh();
})();
