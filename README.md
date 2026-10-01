# 線上英文讀書會文章產生器

主持人輸入存取碼並設定條件，由 AI（Groq）產生英文閱讀文章，再把分享連結給成員閱讀。
純 HTML/CSS/原生 JS 前端 + Vercel Serverless Function（`/api/generate.js`），不使用資料庫。

## 檔案
| 檔案 | 說明 |
|---|---|
| `index.html` | 主持人設定頁（存取碼、條件、預覽、分享連結、列印） |
| `read.html` | 成員閱讀頁（從網址 hash 解碼文章） |
| `api/library.js` | 雲端文章庫（需存取碼）：list / get / save / delete；儲存在 Upstash Redis |
| `api/article.js` | 公開讀取單篇文章（短連結用，不需存取碼） |
| `api/_store.js`、`api/_util.js` | 儲存層與共用工具（底線開頭，不會變成 API 路由） |
| `shared.css`、`vocab.js` | 主持人頁與閱讀頁共用的版面樣式、單字表、雙擊加字、文章標示、字體大小（兩頁行為一致） |
| `api/generate.js` | 產生文章的 API（驗證、限流、呼叫 Groq、串流回應） |
| `api/define.js` | 查單字的 API（Groq）：詞性、KK 音標、英文解釋、中文翻譯；公開端點，每 IP 每分鐘 30 次 |
| `vercel.json` | 函式逾時上限設為 60 秒 |
| `.env.example` | 環境變數範本 |

## 環境變數
| 名稱 | 說明 |
|---|---|
| `GROQ_API_KEY` | Groq 金鑰，到 https://console.groq.com/keys 申請（有免費額度） |
| `AI_MODEL` | 模型名稱，例如 `llama-3.3-70b-versatile` |
| `HOST_CODE` | 主持人存取碼（自訂） |

金鑰與存取碼只存在伺服器端環境變數，不會出現在前端或 repo。

## 雲端文章庫（選用，建議）
沒有設定時，文章庫存在各自瀏覽器、分享連結把整篇文章壓在網址裡（長連結）。設定雲端儲存後：
- 文章庫跨裝置：任何裝置輸入存取碼都看得到同一份。
- 分享連結變成短連結（`read.html?a=代碼`），內容永遠是最新版；主持人改單字，成員重新整理就看到；刪除文章後連結失效。
- 舊的長連結仍可使用。

設定步驟（免費）：
1. Vercel → 專案 → **Storage** → **Create Database** → 選 **Upstash**（Redis）→ 選免費方案 → 連結到此專案（Environments 全部勾選）。
2. Vercel 會自動加入 `KV_REST_API_URL`、`KV_REST_API_TOKEN`（也支援 `UPSTASH_REDIS_REST_URL`/`UPSTASH_REDIS_REST_TOKEN`）。
3. **Redeploy**。重新整理主持人頁後，文章庫標題會變成 ☁ Library；舊的本機文章可按「Upload … from this browser」搬到雲端。

資料結構：`rc:a:<代碼>` = 文章 JSON，`rc:idx` = 依更新時間排序的代碼清單。文章庫最多 500 篇，單篇上限約 12 萬字元。
安全：清單與寫入都要存取碼；成員只能用「猜不到的 12 字元代碼」讀單篇文章。

## 本機測試
```bash
npm i -g vercel
cp .env.example .env    # 填入三個變數
vercel dev              # 開啟 http://localhost:3000
```
API 單獨測試：
```bash
curl -N http://localhost:3000/api/generate \
  -H 'Content-Type: application/json' \
  -d '{"code":"你的HOST_CODE","words":150,"level":"A2","topic":"a day at the market","genre":"story","vocab":true,"questions":true,"discussion":true}'
```
回應為 SSE：`progress`（進度）→ `result`（文章 JSON，含實際字數 `wordCount`、`withinTolerance`）；失敗時為 `error`。

## 部署到 Vercel
1. 把專案推到 GitHub。
2. Vercel → Add New Project → 匯入此 repo（Framework 選 Other，不需 build）。
3. Settings → Environment Variables 加入 `GROQ_API_KEY`、`AI_MODEL`、`HOST_CODE`，然後 Redeploy。
4. 打開網站，輸入存取碼即可使用。

## 已知限制
- **限流**：每 IP 每分鐘 5 次，存在函式記憶體。Serverless 多實例間不共享、冷啟動會重置，只能擋一般濫用，不是嚴格限制。
- **回傳格式**：AI 以 `=== TITLE === / BODY / QUESTIONS / DISCUSSION ===` 分段純文字回傳，而不是 JSON（長文裡的引號、換行會讓 JSON 容易壞掉）；token 上限依字數調整。
- **貼上自己的文章**：主持人頁的「✍ Paste text」可直接貼上文章（不呼叫 AI，不需存取碼，2–8000 字）；之後的單字、發音、文章庫、分享連結都和 AI 產生的文章相同。貼上的文章沒有題目，也沒有「重新產生」，改用「Edit text」修改。
- **段落結構**：提示詞依字數算出段落數（約每段 110 字），並依文體分配「起承轉合」；若 AI 仍一句一段，後端會自動依字數把句子重新合併成段落。
- **字數**：為了串流與避免逾時，超出目標 ±10% 時不自動重試，只回報實際字數並在預覽提示，可按「重新產生」。
- **分享連結**：文章壓縮後放在 `#` 之後（deflate-raw + base64url），不會送到伺服器；文章越長連結越長，超過約 8000 字元時部分通訊軟體可能截斷。舊瀏覽器不支援壓縮時退回未壓縮編碼。
- 介面為英文。單字表一開始是空的：主持人在預覽、成員在閱讀頁，雙擊文章中的單字（或在輸入框輸入）才會加入，由 `/api/define`（Groq）依該字所在的句子查出詞性、KK 音標、英文解釋與中文翻譯。主持人挑的單字會存進文章庫並帶進分享連結。
- `/api/define` 不需存取碼（成員要用），靠單字格式檢查與每 IP 限流防濫用，會消耗 Groq 額度；限流同樣存在記憶體，不是嚴格限制。
