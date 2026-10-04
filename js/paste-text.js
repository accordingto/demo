// 貼上文字的整理（純函式，沒有 DOM 相依，node 測試也會載入這個檔案）

const countWordsIn = (t) => (t.trim().match(/\S+/g) || []).length;

// 每行一題：去掉編號／項目符號，最多 5 題
const toLines = (v) => v.split('\n').map((l) => l.replace(/^\s*(?:\d+[.)]|[-*•])\s*/, '').trim()).filter(Boolean).slice(0, 5);

// 句尾標點（含結尾引號、括號）
const ENDS_SENTENCE = /[.!?…:;]["'”’)\]]*\s*$/;

// 沒有空行、只有單一換行時，判斷是「每行一段」還是「固定寬度硬換行（PDF、email、純文字檔）」
// 硬換行的特徵：至少 3 行、大多數行停在句子中間（沒有句尾標點）、而且各行長度相近
function looksHardWrapped(lines) {
  if (lines.length < 3) return false;
  const body = lines.slice(0, -1);                       // 最後一行通常較短，不列入
  const mid = body.filter((l) => !ENDS_SENTENCE.test(l)).length / body.length;
  const lens = body.map((l) => l.length), mean = lens.reduce((a, b) => a + b, 0) / lens.length;
  const sd = Math.sqrt(lens.reduce((a, b) => a + (b - mean) ** 2, 0) / lens.length);
  return mid >= 0.6 && mean >= 35 && sd / mean < 0.25;
}

// 整理貼上的文字，回傳 { text, how }。text 的段落以空行分隔。
// mode：'auto' 自動判斷｜'lines' 每個換行都是一段｜'blank' 只有空行才分段（單一換行視為同一段）
// how：實際採用的方式 'blank' | 'lines' | 'joined'（用來告訴使用者）
function normalizePasted(raw, mode = 'auto') {
  const t = String(raw)
    .replace(/\r\n?|[\u2028\u2029\u0085]/g, '\n')                                   // 各種換行符號統一
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\u200b\ufeff]/g, '')       // 控制字元、零寬字元
    .replace(/^[ \t\u00a0\u3000]+$/gm, '')                                          // 只有空白的行（含不斷行／全形空白）視為空行
    .replace(/[ \t\u00a0\u3000]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  const blocks = t.split(/\n\n/).map((b) => b.split('\n').map((l) => l.trim()).filter(Boolean)).filter((b) => b.length);
  const join = (ls) => ls.join(' ');

  if (mode === 'lines') return { text: blocks.flat().join('\n\n'), how: 'lines' };
  if (mode === 'blank') return { text: blocks.map(join).join('\n\n'), how: 'blank' };   // 手動：只有空行才分段，區塊內的換行接成一段
  if (blocks.length > 1) {   // 自動：有空行。逐區塊判斷——硬換行的區塊接成一段，一行一段的區塊（逐字稿常見）每行各自成段
    const wrapped = (ls) => ls.length > 1 && (ls.length === 2 ? !ENDS_SENTENCE.test(ls[0]) : looksHardWrapped(ls));
    const anySplit = blocks.some((ls) => ls.length > 1 && !wrapped(ls));
    return { text: blocks.map((ls) => (wrapped(ls) ? join(ls) : ls.join('\n\n'))).join('\n\n'), how: anySplit ? 'lines' : 'blank' };
  }
  const lines = blocks[0] || [];
  if (lines.length < 2) return { text: join(lines), how: 'blank' };
  return looksHardWrapped(lines) ? { text: join(lines), how: 'joined' } : { text: lines.join('\n\n'), how: 'lines' };
}

if (typeof module !== 'undefined') module.exports = { normalizePasted, looksHardWrapped, countWordsIn, toLines };
