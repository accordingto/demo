// 語音合成（瀏覽器內建，免費、不需 API）的共用部分：點字發音與朗讀文章都用它。需先載入 prefs.js
window.TTS = (() => {
  const canSpeak = !!window.speechSynthesis && typeof window.SpeechSynthesisUtterance === 'function';
  // 依設定（口音、語速）建立一段要朗讀的語音
  function utter(text) {
    const uk = Prefs.get('accent') === 'uk';
    const u = new SpeechSynthesisUtterance(text);
    u.lang = uk ? 'en-GB' : 'en-US'; u.rate = Prefs.get('rate');
    const v = speechSynthesis.getVoices().find((x) => (uk ? /^en[-_]GB/i : /^en[-_]US/i).test(x.lang)); if (v) u.voice = v;
    return u;
  }

  // 播放／取消。Safari 與部分瀏覽器在「cancel() 之後立刻 speak()」時，新的語音會被吞掉（沒有聲音），
  // 而且 cancel() 連續呼叫、或在暫停狀態下呼叫，可能讓語音引擎卡住；所以：沒有東西在念就不要 cancel，
  // 真的需要打斷時，cancel 之後稍等一下才開始念新的。
  let timer = 0;
  const busy = () => speechSynthesis.speaking || speechSynthesis.pending || speechSynthesis.paused;
  function cancel() { clearTimeout(timer); timer = 0; if (busy()) speechSynthesis.cancel(); }
  function say(u) {
    clearTimeout(timer); timer = 0;
    if (speechSynthesis.paused && speechSynthesis.resume) speechSynthesis.resume();
    if (busy()) { speechSynthesis.cancel(); timer = setTimeout(() => { timer = 0; speechSynthesis.speak(u); }, 80); }
    else speechSynthesis.speak(u);
  }
  return { canSpeak, utter, say, cancel };
})();
