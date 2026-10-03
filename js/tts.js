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
  return { canSpeak, utter };
})();
