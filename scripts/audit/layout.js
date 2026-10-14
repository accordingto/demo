// 排版檢查：在電腦、iPad 直式／橫式、iPhone 各種尺寸，中英文介面，逐一打開每個畫面，
// 找出「超出畫面左右邊緣」的元素、整頁左右捲動、以及 JavaScript 錯誤；並替代表性尺寸截圖。
// 需要 Playwright（網站本身不依賴它）：NODE_PATH=$(npm root -g) node scripts/audit/layout.js [--langs en,zh] [--out audit-out]
// 注意：這是用 Chromium 模擬尺寸，不是真的 Safari；網址列高度、字型等 Safari 特有的差異測不到。
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');
const { start, seed, OWNER_CODE } = require('./server');

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const LANGS = arg('--langs', 'en,zh').split(',');
const OUT = path.resolve(arg('--out', 'audit-out'));
const DEVICES = {
  'PC 1920': [1920, 1080], 'PC 1536': [1536, 864], 'PC 1440': [1440, 900], 'PC 1366': [1366, 768], 'PC 1280': [1280, 720],
  'iPad mini portrait': [768, 1024], 'iPad Air portrait': [820, 1180], 'iPad Pro 11 portrait': [834, 1194], 'iPad Pro 13 portrait': [1024, 1366],
  'iPad mini landscape': [1024, 768], 'iPad Air landscape': [1180, 820], 'iPad Pro 11 landscape': [1194, 834], 'iPad Pro 13 landscape': [1366, 1024],
  'iPhone SE': [375, 667], 'iPhone 15': [393, 852], 'iPhone 15 Pro Max': [430, 932],
};
const SHOTS = new Set(['PC 1366', 'iPad Air portrait', 'iPad Air landscape', 'iPhone 15']);   // 這幾種尺寸存截圖

const ARTICLE = {
  title: 'Teach girls bravery, not perfection - Reshma Saujani', level: 'B2', source: '', wordCount: 180, targetWords: 180, withinTolerance: true,
  body: Array.from({ length: 4 }, () => 'So a few years ago, I did something really brave, or some would say really stupid. I ran for Congress. For years I had existed safely behind the scenes in politics as a fundraiser, as an organizer. https://youtu.be/fC9da6eqaqg').join('\n\n'),
  questions: ['Why did she run?', 'What happened next?'], discussion: ['Have you ever been brave?'],
};
const VOCAB = [{ word: 'fundraiser', definition: 'a person who raises money', zh: '募款人', kk: '[ˈfʌndˌreɪzɚ]', pos: 'noun' }, { word: 'disrupt the status quo', definition: 'change how things are', zh: '打破現狀', pos: 'phrase' }];

// 每個畫面：怎麼打開它
const VIEWS = {
  'Guide': (p) => p.evaluate(() => showView('help')),
  'Create – choose': (p) => p.evaluate(() => { showView('create'); showTab('choose'); }),
  'Create – AI generate': (p) => p.evaluate(() => { showView('create'); showTab('gen'); }),
  'Create – Paste text': (p) => p.evaluate(() => { showView('create'); showTab('paste'); document.querySelectorAll('#pastePanel details').forEach((d) => { d.open = true; }); }),
  'Create – From a link': (p) => p.evaluate(() => { showView('create'); showTab('link'); }),
  'Article': (p) => p.evaluate(([a, v]) => { current = a; render(current, v); }, [ARTICLE, VOCAB]),
  'Library': (p) => p.evaluate(() => showView('library')),
  'Users': (p) => p.evaluate(() => showView('users')),
  'Reading settings': async (p, w) => { await p.evaluate(() => showView('read')); await p.click(w < 1280 ? '#topbar .gear' : '#sidebar .gear').catch(() => {}); },
};

// 在頁面裡找：超出畫面的元素（可左右捲動的容器裡的不算）、整頁是否能左右捲動
function inspect() {
  const W = innerWidth, out = [];
  const inScroller = (el) => { for (let e = el.parentElement; e && e !== document.body; e = e.parentElement) if (/(auto|scroll)/.test(getComputedStyle(e).overflowX)) return true; return false; };
  for (const el of document.querySelectorAll('body *')) {
    const s = getComputedStyle(el);
    if (s.display === 'none' || s.visibility === 'hidden' || el.closest('.hidden, [hidden]') || s.position === 'fixed') continue;
    if (el.closest('#sidebar') && !document.body.classList.contains('nav-open') && innerWidth < 1280) continue;   // 收起來的抽屜
    const r = el.getBoundingClientRect(); if (!r.width || !r.height) continue;
    if ((r.right > W + 1 || r.left < -1) && !inScroller(el)) {
      const cls = typeof el.className === 'string' && el.className.trim() ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.') : '';
      out.push(`${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}${cls} (x ${Math.round(r.left)}–${Math.round(r.right)}, screen ${W})`);
    }
  }
  return { pageScroll: document.documentElement.scrollWidth > W + 1 || document.body.scrollWidth > W + 1, overflow: [...new Set(out)].slice(0, 6) };
}

(async () => {
  const { srv, url } = await start(0); await seed(url);
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const problems = [];
  for (const lang of LANGS) {
    for (const [device, [w, h]] of Object.entries(DEVICES)) {
      const ctx = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: !device.startsWith('PC'), isMobile: device.startsWith('iPhone') });
      const page = await ctx.newPage(); const errors = [];
      page.on('pageerror', (e) => errors.push(e.message));
      await page.addInitScript((l) => { localStorage.setItem('rc-lang', l); localStorage.setItem('rc-hint-read', '1'); }, lang);
      await page.goto(url + '/'); await page.waitForTimeout(300);
      await page.evaluate((c) => { const i = document.getElementById('code'); i.value = c; i.dispatchEvent(new Event('change', { bubbles: true })); }, OWNER_CODE);
      await page.waitForTimeout(700);
      for (const [view, open] of Object.entries(VIEWS)) {
        await open(page, w); await page.waitForTimeout(view === 'Library' || view === 'Users' ? 700 : 250);
        const r = await page.evaluate(inspect);
        if (r.pageScroll || r.overflow.length || errors.length) problems.push({ lang, device, view, ...r, errors: errors.splice(0) });
        if (lang === LANGS[0] && SHOTS.has(device)) await page.screenshot({ path: path.join(OUT, `${device} - ${view}.png`.replace(/[^\w .–-]/g, '')) });
      }
      await ctx.close();
    }
  }
  await browser.close(); srv.close();
  const checked = LANGS.length * Object.keys(DEVICES).length * Object.keys(VIEWS).length;
  console.log(`Checked ${checked} screens (${LANGS.join('+')} × ${Object.keys(DEVICES).length} sizes × ${Object.keys(VIEWS).length} views). Screenshots: ${OUT}`);
  if (!problems.length) { console.log('No layout problems found.'); return; }
  console.log(`\n${problems.length} screen(s) with problems:`);
  for (const p of problems) {
    console.log(`\n- [${p.lang}] ${p.device} → ${p.view}${p.pageScroll ? '  (the whole page scrolls sideways)' : ''}`);
    p.overflow.forEach((o) => console.log('    off-screen: ' + o));
    p.errors.forEach((e) => console.log('    JS error: ' + e));
  }
  process.exitCode = 1;
})();
