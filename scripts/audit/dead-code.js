// 找出「沒被用到的程式碼」：前端函式／常數、HTML id、CSS class、SVG 圖示、後端模組的匯出。
// 只是提示清單（可能有誤判，例如只在字串裡組出來的名稱），刪除前請再確認一次。用法：node scripts/audit/dead-code.js
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const list = (d, ext) => fs.readdirSync(path.join(ROOT, d)).filter((f) => f.endsWith(ext)).map((f) => `${d}/${f}`);

const jsFiles = list('js', '.js'), apiFiles = list('api', '.js'), cssFiles = list('css', '.css'), testFiles = list('tests', '.js');
const js = jsFiles.map(read).join('\n'), html = ['index.html', 'read.html'].map(read).join('\n');
const css = cssFiles.map(read).join('\n').replace(/\/\*[\s\S]*?\*\//g, '');
const front = js + '\n' + html;
const count = (text, name) => (text.match(new RegExp(`(?<![\\w$])${name.replace(/\$/g, '\\$')}(?![\\w$])`, 'g')) || []).length;
const report = {};

// 1. 前端：宣告後只出現一次（只有宣告本身）的函式、常數
const names = new Set([...js.matchAll(/(?:function\s+([A-Za-z_$][\w$]*)|(?:const|let)\s+([A-Za-z_$][\w$]*)\s*=)/g)].map((m) => m[1] || m[2]));
report['Front-end functions / constants used only where declared'] = [...names].filter((n) => count(front, n) <= 1);

// 2. HTML 裡定義、但 JS、CSS、HTML 其他地方都沒用到的 id
const ids = new Set([...html.matchAll(/<(?!symbol)\w+[^>]*\sid="([\w-]+)"/g)].map((m) => m[1]));   // SVG 圖示另外檢查
report['Element ids never referenced'] = [...ids].filter((id) => !new RegExp(`['"\`#]${id}['"\`\\s,):.\\[]|for="${id}"|aria-[\\w-]+="${id}"|href="#${id}"`).test(js + css + html.replace(new RegExp(`\\sid="${id}"`, 'g'), '')));

// 3. CSS 裡寫了、但 HTML 和 JS 都沒用到的 class
const used = new Set();
for (const m of front.matchAll(/class(?:Name)?\s*=\s*["'`]([^"'`]*)["'`]/g)) m[1].split(/\s+/).forEach((c) => used.add(c.replace(/\$\{.*$/, '')));
for (const m of js.matchAll(/['"`]([^'"`\n]*)['"`]/g)) { for (const c of m[1].split(/[\s.#>+~:,()[\]]+/)) used.add(c); }
const cssClasses = new Set([...css.matchAll(/\.([a-zA-Z][\w-]*)/g)].map((m) => m[1]));
report['CSS classes not used in HTML / JS'] = [...cssClasses].filter((c) => !used.has(c));

// 4. SVG sprite 裡沒用到的圖示
const icons = [...read('index.html').matchAll(/<symbol id="([\w-]+)"/g)].map((m) => m[1]);
report['Unused SVG icons'] = icons.filter((i) => !new RegExp(`#${i}['"]`).test(front));

// 5. 後端模組（api/_*.js）匯出了、但沒有其他檔案用到的名稱
const apiAll = apiFiles.map((f) => [f, read(f)]), testAll = testFiles.map(read).join('\n');
const unusedExports = [];
for (const [f, src] of apiAll.filter(([f]) => path.basename(f).startsWith('_'))) {
  const m = /module\.exports\s*=\s*\{([^}]*)\}/.exec(src); if (!m) continue;
  for (const raw of m[1].split(',')) {
    const n = raw.split(':')[0].trim(); if (!n || n === '__test') continue;
    const elsewhere = apiAll.filter(([g]) => g !== f).map(([, s]) => s).join('\n') + testAll;
    if (!count(elsewhere, n)) unusedExports.push(`${f}: ${n}`);
  }
}
report['Back-end exports nobody imports'] = unusedExports;

let total = 0;
for (const [title, items] of Object.entries(report)) { total += items.length; console.log(`\n## ${title} (${items.length})`); items.forEach((x) => console.log('  - ' + x)); }
console.log(`\nTotal: ${total} item(s). Double-check each one before deleting.`);
