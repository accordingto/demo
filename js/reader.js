// 成員閱讀頁：載入文章（雲端短連結 ?a=<id>，或舊式長連結 #…）並顯示；版面與單字功能和主持人頁共用（util.js、vocab.js）
let current = null; // 目前顯示的文章 { title, body, level, questions, discussion }
let ready = false;  // 還原完成前不要寫入本機儲存
const articleId = new URLSearchParams(location.search).get('a');
const storageKey = articleId ? 'rc-user-a-' + articleId : 'rc-user-' + [...location.hash].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7); // 以連結區分文章

// 成員自己加入的單字，存在自己的瀏覽器（主持人挑的字隨連結帶入，不存）
function persist(items) {
  if (!ready) return;
  try {
    localStorage.setItem(storageKey, JSON.stringify(items.filter((v) => !v.locked && !v.loading && !v.failed)
      .map(({ word, pos, definition, zh, kk, lemma }) => ({ word, pos, definition, zh, kk, lemma }))));
  } catch { /* 無痕模式或被封鎖時略過 */ }
}
Vocab.init({ getBody: () => current?.body, onChange: persist });

// a：{ t 標題, b 內文, l 程度, q 理解題, d 討論題, hv 主持人挑的單字 [[word, definition, zh, kk, pos, lemma], …] }
function show(a) {
  current = { title: a.t, body: a.b, level: a.l, questions: a.q, discussion: a.d };
  document.title = a.t;
  const words = a.b.trim().split(/\s+/).length;
  $('doc').innerHTML =
    `<div class="text"><h2>${esc(a.t)}</h2>` +
    `<div class="meta">${a.l ? `Level ${esc(a.l)}` : 'Shared text'} ・ ${words} words ・ ~${readMinutes(words)} min read</div>` +
    '<div id="bodyText" style="margin-top:1em"></div></div>';
  $('qa').innerHTML = questionsHtml(a.q, a.d);

  // 單字表：主持人挑的字（不可移除）+ 這位讀者先前自己加入的字
  const list = a.hv.map(([word, definition, zh, kk, pos, lemma]) => ({ word, definition, zh, kk: kk || '', pos: pos || '', lemma: lemma || '', locked: true }));
  try {
    JSON.parse(localStorage.getItem(storageKey) || '[]').forEach((u) => {
      if (u?.word && !list.some((x) => x.word.toLowerCase() === u.word.toLowerCase())) list.push({ word: u.word, pos: u.pos || '', definition: u.definition || '', zh: u.zh || '', kk: u.kk || '', lemma: u.lemma || '' });
    });
  } catch { /* 忽略 */ }
  Vocab.setItems(list);
  ready = true;
  Vocab.getItems().filter((v) => !v.locked && !v.definition && !v.zh).forEach((v) => Vocab.fillWord(v)); // 先前沒查完的字重新查
}

function showError(html) {
  $('doc').innerHTML = `<div class="err" style="padding:32px 0;text-align:center">${html}</div>`;
  $('preview').querySelector('.fsbar').classList.add('hidden');
}

// 從雲端讀取短連結的文章（總是最新版），轉成與舊式連結相同的格式
async function loadCloud(id) {
  $('doc').innerHTML = '<div class="meta" style="padding:32px 0;text-align:center">Loading…</div>';
  const r = await fetch('/api/article?id=' + encodeURIComponent(id));
  const j = await r.json().catch(() => ({}));
  if (r.status === 404) throw new Error('This article was removed, or the link is incorrect.<br>Please ask the host for a new link.');
  if (!r.ok) throw new Error(esc(j.error || `Could not load the article (${r.status}).`));
  const A = j.article || {};
  return { t: A.title, b: A.body, l: A.level || '', q: A.questions || [], d: A.discussion || [], hv: (j.vocab || []).map((v) => [v.word, v.definition, v.zh, v.kk || '', v.pos || '', v.lemma || '']) };
}

(async () => {
  try {
    const a = articleId ? await loadCloud(articleId) : await decodeShare(location.hash.slice(1));
    if (typeof a.b !== 'string' || typeof a.t !== 'string') throw new Error('bad');
    a.q = Array.isArray(a.q) ? a.q : []; a.d = Array.isArray(a.d) ? a.d : []; a.hv = Array.isArray(a.hv) ? a.hv : [];
    show(a);
  } catch (e) {
    showError(e.message && e.message !== 'bad' && articleId ? e.message : 'Article not found. The link may be incomplete or damaged.<br>Please ask the host for a new link.');
  }
})();
