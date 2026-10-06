// 使用者帳號（存在雲端資料庫，由擁有者在管理介面新增／改密碼／停用／刪除）。檔名以底線開頭，不是 API 路由。
// 密碼由擁有者設定；資料庫只存「加了隨機鹽的 scrypt 雜湊」，不存明文。
//   rc:users  (hash)  名稱 → JSON { name, createdAt, disabled, salt, hash }
//   rc:seen   (hash)  名稱 → 最近活動時間（毫秒）；登入後的每次請求都會更新（同一個執行個體 5 分鐘內只寫一次）
//   （舊版隨機產生的存取碼：{ codeHash }（SHA-256），仍可登入，改過密碼後就換成 scrypt）
// 登入欄位只有一個（Access code），所以每個人的密碼必須各不相同，也不能和擁有者的 HOST_CODE 相同。
// 擁有者用環境變數 HOST_CODE，不在這裡（所以就算資料庫出問題，擁有者也進得去）
const crypto = require('crypto');
const { promisify } = require('util');
const store = require('./_store');
const { WELCOME } = require('./_welcome');

const scrypt = promisify(crypto.scrypt);
const USERS = 'rc:users', SEEN = 'rc:seen';
const NAME_RE = /^[a-z0-9_-]{1,20}$/;
const RESERVED = ['owner'];
const MIN_PASSWORD = 8, MAX_PASSWORD = 100;

const parse = (s) => { try { return s ? JSON.parse(s) : null; } catch { return null; } };
const sha256 = (code) => crypto.createHash('sha256').update(String(code)).digest('hex');
const eq = (a, b) => a.length === b.length && crypto.timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'));

async function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  return { salt, hash: (await scrypt(password, Buffer.from(salt, 'hex'), 32)).toString('hex') };
}
async function matches(u, password) {   // 新格式（scrypt）或舊版隨機存取碼（SHA-256）
  if (u.salt && u.hash) return eq(u.hash, (await scrypt(password, Buffer.from(u.salt, 'hex'), 32)).toString('hex'));
  return !!u.codeHash && eq(u.codeHash, sha256(password));
}

async function all() {
  const flat = await store.cmd('HGETALL', USERS) || [];
  const users = [];
  for (let i = 1; i < flat.length; i += 2) { const u = parse(flat[i]); if (u) users.push(u); }
  return users;
}
const get = async (name) => parse(await store.cmd('HGET', USERS, name));
const put = (u) => store.cmd('HSET', USERS, u.name, JSON.stringify(u));

// 用密碼找使用者。每位使用者都比對一次（不會因為是誰而提早結束）；找不到回傳 null。資料庫連不上也當作找不到（擁有者不受影響）
async function findByCode(code) {
  if (!store.configured() || !code) return null;
  try {
    const users = await all();
    const hits = await Promise.all(users.map((u) => matches(u, String(code)).catch(() => false)));
    return users[hits.indexOf(true)] || null;
  } catch { return null; }
}

// 記錄最近活動時間。同一個執行個體 5 分鐘內只寫一次，失敗也不影響正常使用
const lastTouch = new Map();
async function touch(name) {
  const now = Date.now();
  if (!store.configured() || now - (lastTouch.get(name) || 0) < 300000) return;
  lastTouch.set(name, now);
  try { await store.cmd('HSET', SEEN, name, String(now)); } catch { /* 略過 */ }
}

async function list() {
  const users = (await all()).sort((a, b) => a.createdAt - b.createdAt);
  const counts = users.length ? await store.pipeline(users.map((u) => ['ZCARD', store.INDEX(u.name)])) : [];
  const flat = await store.cmd('HGETALL', SEEN) || [], seen = {};
  for (let i = 0; i + 1 < flat.length; i += 2) seen[flat[i]] = Number(flat[i + 1]) || 0;
  return users.map((u, i) => ({ name: u.name, createdAt: u.createdAt, disabled: !!u.disabled, articles: Number(counts[i]) || 0, lastActive: seen[u.name] || null }));
}

// 檢查密碼：長度、不能和擁有者相同、不能和其他使用者相同（except：正在改密碼的那位自己）
async function checkPassword(password, { except, ownerCode } = {}) {
  const pw = String(password ?? '').trim();
  if (pw.length < MIN_PASSWORD || pw.length > MAX_PASSWORD) throw new UserError(`The password must be ${MIN_PASSWORD}–${MAX_PASSWORD} characters.`, 400);
  if (ownerCode && pw === ownerCode) throw new UserError('Choose a different password.', 400);
  for (const u of await all()) if (u.name !== except && await matches(u, pw)) throw new UserError('That password is already used by another user — choose a different one.', 409);
  return pw;
}

// 新使用者的文章庫先放一篇歡迎文章（B1、約 300 字、標好 5 個單字）
async function seedWelcome(name) {
  const id = crypto.randomBytes(9).toString('base64url'), now = Date.now();
  const item = { id, createdAt: now, updatedAt: now, article: WELCOME.article, vocab: WELCOME.vocab, owner: name };
  await store.pipeline([['SET', store.KEY(id), JSON.stringify(item)], ['ZADD', store.INDEX(name), now, id]]);
}

async function add(name, password, opts) {
  name = String(name ?? '').trim().toLowerCase();
  if (!NAME_RE.test(name) || RESERVED.includes(name)) throw new UserError('Use 1–20 letters, numbers, “-” or “_” for the name (not “owner”).', 400);
  if (await get(name)) throw new UserError(`“${name}” already exists.`, 409);
  const pw = await checkPassword(password, opts);
  await put({ name, createdAt: Date.now(), disabled: false, ...(await hashPassword(pw)) });
  await seedWelcome(name).catch(() => { /* 歡迎文章放不進去也不影響帳號建立 */ });
  return { name };
}

async function setPassword(name, password, opts) {   // 改密碼：舊的立刻失效
  const u = await get(name); if (!u) throw new UserError('User not found.', 404);
  const pw = await checkPassword(password, { ...opts, except: name });
  const { codeHash, ...rest } = u;
  await put({ ...rest, ...(await hashPassword(pw)) });
  return { name };
}

async function setDisabled(name, disabled) {   // 停用：不能登入，但文章保留
  const u = await get(name); if (!u) throw new UserError('User not found.', 404);
  await put({ ...u, disabled: !!disabled });
}

async function remove(name) {   // 刪除使用者，連同他的所有文章
  const u = await get(name); if (!u) throw new UserError('User not found.', 404);
  const idx = store.INDEX(name), ids = await store.cmd('ZRANGE', idx, 0, -1) || [];
  const cmds = [['HDEL', USERS, name], ['HDEL', SEEN, name], ['DEL', idx]];
  for (let i = 0; i < ids.length; i += 100) cmds.push(['DEL', ...ids.slice(i, i + 100).map(store.KEY)]);
  await store.pipeline(cmds);
  return { deletedArticles: ids.length };
}

class UserError extends Error { constructor(m, status) { super(m); this.status = status; } }

module.exports = { findByCode, touch, list, add, setPassword, setDisabled, remove, UserError, NAME_RE, MIN_PASSWORD };
