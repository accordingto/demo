// Upstash Redis（透過 REST API）— 雲端文章庫的儲存層。不需要任何 npm 套件。
// 在 Vercel 的 Storage 建立 Upstash Redis 並連結專案後，會自動加入下列環境變數（兩種命名都支援）：
//   KV_REST_API_URL / KV_REST_API_TOKEN   或   UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN
const conf = () => ({
  url: (process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || '').trim().replace(/\/+$/, ''),
  token: (process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || '').trim(),
});
const configured = () => { const c = conf(); return !!(c.url && c.token); };

async function call(path, body) {
  const { url, token } = conf();
  const r = await fetch(url + path, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(8000),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `Storage error (${r.status})`);
  return j;
}
// 單一指令，例如 cmd('GET', key)
async function cmd(...args) {
  const j = await call('', args);
  if (j.error) throw new Error(j.error);
  return j.result;
}
// 多個指令一次送出（原子性不保證，但只需一次往返）
async function pipeline(cmds) {
  const arr = await call('/pipeline', cmds);
  return arr.map((x) => { if (x.error) throw new Error(x.error); return x.result; });
}

const KEY = (id) => `rc:a:${id}`;
const INDEX = 'rc:idx'; // sorted set：member = 文章 id，score = 更新時間

module.exports = { configured, cmd, pipeline, KEY, INDEX };
