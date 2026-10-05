// 使用者帳號（存在雲端資料庫，由擁有者在管理介面新增／重設／停用／刪除）。檔名以底線開頭，不是 API 路由。
// 資料庫只存存取碼的 SHA-256 雜湊，不存明文；存取碼由系統隨機產生，只在新增或重設時顯示一次。
//   rc:users  (hash)  名稱 → JSON { name, createdAt, disabled, codeHash }
//   rc:codes  (hash)  雜湊 → 名稱（用存取碼反查是誰）
// 擁有者用環境變數 HOST_CODE，不在這裡（所以就算資料庫出問題，擁有者也進得去）
const crypto = require('crypto');
const store = require('./_store');

const USERS = 'rc:users', CODES = 'rc:codes';
const NAME_RE = /^[a-z0-9_-]{1,20}$/;
const RESERVED = ['owner'];

const hashCode = (code) => crypto.createHash('sha256').update(String(code)).digest('hex');
const newCode = () => crypto.randomBytes(18).toString('base64url');   // 24 個字元（144 位元），猜不到
const parse = (s) => { try { return s ? JSON.parse(s) : null; } catch { return null; } };

// 用存取碼找使用者。找不到回傳 null；資料庫連不上也當作找不到（擁有者不受影響）
async function findByCode(code) {
  if (!store.configured() || !code) return null;
  try {
    const name = await store.cmd('HGET', CODES, hashCode(code));
    return name ? parse(await store.cmd('HGET', USERS, name)) : null;
  } catch { return null; }
}

async function list() {
  const flat = await store.cmd('HGETALL', USERS) || [];
  const users = [];
  for (let i = 1; i < flat.length; i += 2) { const u = parse(flat[i]); if (u) users.push(u); }
  users.sort((a, b) => a.createdAt - b.createdAt);
  const counts = users.length ? await store.pipeline(users.map((u) => ['ZCARD', store.INDEX(u.name)])) : [];
  return users.map((u, i) => ({ name: u.name, createdAt: u.createdAt, disabled: !!u.disabled, articles: Number(counts[i]) || 0 }));
}
const get = async (name) => parse(await store.cmd('HGET', USERS, name));

async function add(name) {
  name = String(name ?? '').trim().toLowerCase();
  if (!NAME_RE.test(name) || RESERVED.includes(name)) throw new UserError('Use 1–20 letters, numbers, “-” or “_” for the name (not “owner”).', 400);
  if (await get(name)) throw new UserError(`“${name}” already exists.`, 409);
  const code = newCode();
  await store.pipeline([['HSET', USERS, name, JSON.stringify({ name, createdAt: Date.now(), disabled: false, codeHash: hashCode(code) })], ['HSET', CODES, hashCode(code), name]]);
  return { name, code };
}

async function reset(name) {   // 產生新的存取碼，舊的立刻失效
  const u = await get(name); if (!u) throw new UserError('User not found.', 404);
  const code = newCode();
  await store.pipeline([['HDEL', CODES, u.codeHash], ['HSET', USERS, name, JSON.stringify({ ...u, codeHash: hashCode(code) })], ['HSET', CODES, hashCode(code), name]]);
  return { name, code };
}

async function setDisabled(name, disabled) {   // 停用：不能登入，但文章保留
  const u = await get(name); if (!u) throw new UserError('User not found.', 404);
  await store.cmd('HSET', USERS, name, JSON.stringify({ ...u, disabled: !!disabled }));
}

async function remove(name) {   // 刪除使用者，連同他的所有文章
  const u = await get(name); if (!u) throw new UserError('User not found.', 404);
  const idx = store.INDEX(name), ids = await store.cmd('ZRANGE', idx, 0, -1) || [];
  const cmds = [['HDEL', CODES, u.codeHash], ['HDEL', USERS, name], ['DEL', idx]];
  for (let i = 0; i < ids.length; i += 100) cmds.push(['DEL', ...ids.slice(i, i + 100).map(store.KEY)]);
  await store.pipeline(cmds);
  return { deletedArticles: ids.length };
}

class UserError extends Error { constructor(m, status) { super(m); this.status = status; } }

module.exports = { findByCode, list, add, reset, setDisabled, remove, hashCode, UserError, NAME_RE };
