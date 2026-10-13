// TED 講者頁面的逐字稿（檔名以底線開頭，不是 API 路由）。
// TED 的頁面本身就公開放了完整逐字稿（畫面上的「Read transcript」用的就是它），存在頁面的 __NEXT_DATA__ 資料裡。
// 這裡只讀那份公開資料；抓頁面一律走 _fetch.js（防 SSRF）。資料結構不寫死路徑，而是搜尋「段落裡有 cues（字幕）」的結構，TED 改版時比較不容易壞。
const { pageTitle } = require('./_extract');

// 是不是 TED 講者頁；是的話回傳一律抓英文版的網址
function tedUrl(raw) {
  let u; try { u = new URL(String(raw).trim()); } catch { return null; }
  if (!/^https?:$/.test(u.protocol)) return null;
  const host = u.hostname.toLowerCase().replace(/^www\./, '');
  const m = /^\/talks\/[\w-]+/.exec(u.pathname);
  return (host === 'ted.com' || host === 'embed.ted.com') && m ? `https://www.ted.com${m[0]}?language=en` : null;
}

// 在資料裡找「每一項都有 cues 陣列」的段落清單
function findParagraphs(o, depth = 0) {
  if (!o || typeof o !== 'object' || depth > 10) return null;
  if (Array.isArray(o)) {
    if (o.length && o.every((p) => p && Array.isArray(p.cues))) return o;
    for (const x of o) { const r = findParagraphs(x, depth + 1); if (r) return r; }
    return null;
  }
  for (const k of Object.keys(o)) { const r = findParagraphs(o[k], depth + 1); if (r) return r; }
  return null;
}
const parseMaybe = (v) => { if (typeof v !== 'string') return v; try { return JSON.parse(v); } catch { return null; } };

// 舞台說明（(Laughter)、(Applause)、(Music) 等）拿掉，比較好讀；句中的一般括號不動
const STAGE = /\((?:laughter|applause|music|cheers?|cheering|audience[^)]{0,30}|video|audio|singing|sighs?|laughs?|ends?|music ends|piano|guitar|drums?)\)/gi;
const clean = (t) => t.replace(STAGE, ' ').replace(/♫[^♫]*♫/g, ' ').replace(/\s+/g, ' ').trim();

// 從 TED 頁面 HTML 取出 { title, text }；找不到逐字稿回傳 null
function parseTed(html) {
  const m = /<script[^>]*id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/.exec(html);
  if (!m) return null;
  let data; try { data = JSON.parse(m[1]); } catch { return null; }
  const pp = data?.props?.pageProps || data;
  const paras = findParagraphs(parseMaybe(pp.transcriptData)) || findParagraphs(pp);
  if (!paras) return null;
  const text = paras.map((p) => clean(p.cues.map((c) => (c && c.text) || '').join(' '))).filter(Boolean).join('\n\n');
  if ((text.match(/\S+/g) || []).length < 20) return null;
  const vd = parseMaybe(pp.videoData) || {};
  const speaker = vd.presenterDisplayName || vd.speakers?.nodes?.[0]?.name || '';
  const t = vd.title || pageTitle(html).replace(/\s*\|\s*TED.*$/i, '');
  return { title: t && speaker && !t.includes(speaker) ? `${t} - ${speaker}` : t || '', text };
}

module.exports = { tedUrl, parseTed };
