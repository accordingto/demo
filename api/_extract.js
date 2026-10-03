// 從網頁 HTML 擷取主要文章（沒有任何相依套件的簡易版 Readability）。檔名以底線開頭，不是 API 路由。
// 作法：找出「文字密度最高的一串段落」當成文章本體，再補上這串段落之間的小標題與清單，並去掉廣告、訂閱等雜訊。

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', ndash: '–', mdash: '—', hellip: '…', copy: '©', reg: '®', trade: '™', euro: '€', pound: '£', yen: '¥', cent: '¢', deg: '°', middot: '·', bull: '•', laquo: '«', raquo: '»', times: '×', sect: '§', szlig: 'ß', aelig: 'æ', oelig: 'œ' };
const ACCENTS = { acute: '\u0301', grave: '\u0300', uml: '\u0308', circ: '\u0302', tilde: '\u0303', cedil: '\u0327', ring: '\u030a' };   // &eacute; → e + 合成重音 → é
const named = (n) => ENTITIES[n] ?? ENTITIES[n.toLowerCase()] ?? (/^[A-Za-z](acute|grave|uml|circ|tilde|cedil|ring)$/.test(n) ? (n[0] + ACCENTS[n.slice(1)]).normalize('NFC') : null);
const decode = (s) => s
  .replace(/&#x([0-9a-f]+);/gi, (_, h) => { try { return String.fromCodePoint(parseInt(h, 16)); } catch { return ' '; } })
  .replace(/&#(\d+);/g, (_, d) => { try { return String.fromCodePoint(+d); } catch { return ' '; } })
  .replace(/&([a-z]+);/gi, (m, n) => named(n) ?? m);
const textOf = (html) => decode(html.replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
const wordsOf = (t) => (t.match(/\S+/g) || []).length;

// 雜訊段落（廣告、訂閱、版權、分享…）
const NOISE = /^(advertisement|advertising|sponsored|ad\b|sign up|subscribe|subscribed|follow us|follow @|share this|share on|related( articles| stories)?|read more|read also|more from|also read|recommended|©|copyright|all rights reserved|cookie|we use cookies|privacy policy|terms (of|and)|click here|image (source|credit)|photo:|credit:|newsletter|log ?in|sign in|comments?\b)/i;

function metaContent(html, key) {
  const m = new RegExp(`<meta[^>]+(?:property|name)=["']${key}["'][^>]*>`, 'i').exec(html) || new RegExp(`<meta[^>]+content=[^>]*(?:property|name)=["']${key}["'][^>]*>`, 'i').exec(html);
  const c = m && /content=["']([^"']*)["']/i.exec(m[0]);
  return c ? decode(c[1]).trim() : '';
}

function pageTitle(html) {
  let t = metaContent(html, 'og:title');
  if (!t) { const h1 = /<h1\b[^>]*>([\s\S]*?)<\/h1>/i.exec(html); t = h1 ? textOf(h1[1]) : ''; }
  if (!t) { const tt = /<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(html); t = tt ? textOf(tt[1]) : ''; }
  const cut = t.replace(/\s+[|\-–—·»]\s+[^|\-–—·»]{2,40}$/, '');   // 去掉結尾的「 | 網站名稱」
  return (cut.length >= 12 ? cut : t).slice(0, 200);
}

function clean(html) {
  return html
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style|noscript|svg|iframe|template|form|nav|footer|aside|button|select|dialog|canvas|video|audio)\b[\s\S]*?<\/\1>/gi, ' ');
}

// 在 html 片段裡，把 <p> 依「彼此距離」分群，回傳字數最多的一群 { start, end }（相對於片段）
function bestCluster(html) {
  const ps = [];
  for (const m of html.matchAll(/<(p|li)\b[^>]*>([\s\S]*?)<\/\1>/gi)) {   // 長的清單項目也算內文（導覽列的 li 很短，不會算進來）
    const t = textOf(m[2]);
    if (m[1].toLowerCase() === 'li' && t.length < 60) continue;
    if (t.length >= 60 || (t.length >= 30 && /[.!?…"”’]$/.test(t))) if (!NOISE.test(t)) ps.push({ s: m.index, e: m.index + m[0].length, w: wordsOf(t) });
  }
  let best = null, cur = null;
  for (const p of ps) {
    if (cur && p.s - cur.e < 2500) { cur.e = p.e; cur.w += p.w; } else { cur = { s: p.s, e: p.e, w: p.w }; }
    if (!best || cur.w > best.w) best = cur;
  }
  return best;
}

// 回傳 { title, paragraphs[], text, words, truncated } 或 null（找不到文章）
function extractArticle(html, { maxWords = 8000 } = {}) {
  const title = pageTitle(html);
  let doc = clean(html);
  // 有 <article> 就優先在最大的 <article> 裡找
  const arts = [...doc.matchAll(/<article\b[^>]*>([\s\S]*?)<\/article>/gi)].map((m) => m[1]).sort((a, b) => b.length - a.length);
  if (arts[0] && wordsOf(textOf(arts[0])) >= 80) doc = arts[0];
  const c = bestCluster(doc);
  if (!c || c.w < 50) return null;

  const seen = new Set(), paragraphs = [];
  for (const m of doc.slice(c.s, c.e).matchAll(/<(p|h2|h3|h4|blockquote|li)\b[^>]*>([\s\S]*?)<\/\1>/gi)) {
    let t = textOf(m[2]);
    const tag = m[1].toLowerCase();
    if (t.length < (tag === 'p' || tag === 'blockquote' ? 20 : 3) || NOISE.test(t) || seen.has(t)) continue;
    if (tag === 'li') { if (t.length < 25) continue; t = '• ' + t; }
    seen.add(t); paragraphs.push(t);
  }
  // 去掉第一段若只是標題的重複
  if (paragraphs[0] && title && paragraphs[0].toLowerCase() === title.toLowerCase()) paragraphs.shift();

  let words = 0, truncated = false; const out = [];
  for (const p of paragraphs) {
    const w = wordsOf(p);
    if (words + w > maxWords) { truncated = true; break; }
    out.push(p); words += w;
  }
  if (words < 50) return null;
  return { title, paragraphs: out, text: out.join('\n\n'), words, truncated };
}

module.exports = { extractArticle, textOf, pageTitle };
