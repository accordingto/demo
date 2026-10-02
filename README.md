# 線上英文讀書會文章產生器（Reading Club）

主持人設定字數、主題、CEFR 程度（A1–C2）與文體，由 AI（[Groq](https://console.groq.com)）寫出一篇英文閱讀文章；
也可以直接貼上自己的文章。主持人在預覽頁挑單字、編輯文章，再把**分享連結**傳給成員，成員用同樣的介面閱讀、查單字、聽發音。

- 純 HTML / CSS / 原生 JavaScript 前端，**沒有打包工具、沒有前端框架**
- 後端是 Vercel Serverless Functions（`/api/*.js`，Node.js，**零 npm 相依套件**）
- 金鑰與存取碼只存在伺服器端環境變數，不會出現在前端或 repo
- 文章庫預設存在瀏覽器；設定 Upstash Redis（免費）後變成**跨裝置的雲端文章庫 + 短分享連結**

> 想了解程式怎麼分工、資料怎麼流動，請看 [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)。

---

## 功能一覽

### 主持人頁（`index.html`）
| 功能 | 說明 |
|---|---|
| 產生文章 | 字數 100–2000、主題、CEFR A1–C2、文體（解釋／故事／新聞）、理解題 2 題、討論題 2 題；以串流顯示進度 |
| 貼上文章 | 「✍ Paste」貼上自己的文章（20–8000 字，不呼叫 AI、不需存取碼），可附題目（每行一題）。**Paragraphs** 選單決定怎麼分段：*Auto-detect*（預設）／*Every line break starts a paragraph*／*Only blank lines start a paragraph*；面板上方會即時顯示字數與段落數（自動模式也顯示判斷結果） |
| 就地編輯 | 「✍ Edit」直接在畫面上改標題、本文、題目（所見即所得、只接受純文字）；Ctrl/⌘+S 儲存 |
| 單字表 | 在文章上**連點兩下**單字（或在輸入框輸入）加入；由 AI 查出詞性、KK 音標、英文解釋、中文翻譯 |
| 發音 | 點文章中**任何單字**或單字卡的 🔊，用瀏覽器內建語音（免費、不需 API）朗讀；被點到的字會有約 1 秒的綠色光圈與底色回饋，讓你知道點了哪個字 |
| 文章標示 | 已加入的字在文章中以藍色底色標示（含變化形，如 called → call）。**點文章中的任何單字**：發音、播放約 1 秒光圈，並關閉所有單字卡；如果是已加入的字，改為打開它的單字卡，文章中這個字的每一處換成橘色，3 秒後卡片收起、橘色恢復（窄螢幕＝浮動單字卡消失時恢復）。**點右側單字卡**：發音、展開這張並收起其他張，文章中這個字換成橘色（不標整句、不移動畫面），橘色保留到下一次點擊文章或按 Esc |
| 單字卡 | 剛加入時完整展開；英文與中文都取得後 5 秒自動收成第一行；沒有箭頭，點卡片展開（同時只會展開一張，其他自動收起）|
| 文章庫 | 儲存文章與單字；雲端模式跨裝置，本機模式可匯出／匯入備份 |
| 分享 | 「Create share link」：雲端為短連結 `read.html?a=<代碼>`，本機為把整篇文章壓進網址的長連結 |
| 其他 | 文字大小 A−／A+（連題目一起放大）、列印、設定自動記住（存取碼、主題、字數…） |

### 成員閱讀頁（`read.html`）
與主持人頁相同的版面與單字功能。主持人挑的單字顯示為鎖定的單字卡；成員自己加的單字只存在自己的瀏覽器。

### 手機／平板直放
- 寬度 ≥ 1100px：左＝文章、右＝固定的單字表（沒有單字也保留這個區塊）
- 寬度 < 1100px：單字表排在文章下面（看不到），所以加入單字或點已標示的字時，會從畫面下方**浮出單字卡**；英文與中文都取得後 5 秒自動消失，點卡片可固定住，✕／Esc 關閉；點文章中其他單字會立刻關閉它
- 觸控裝置：輸入框 16px（避免 iOS 自動放大）、按鈕與可點區域 ≥ 44px

---

## 專案結構

```
.
├── index.html            主持人頁（只有版面標記）
├── read.html             成員閱讀頁（只有版面標記）
├── css/
│   ├── shared.css        兩頁共用：主題色、版面、文章、單字卡、浮動單字卡、列印
│   └── host.css          主持人頁專用：設定列、貼上面板、文章庫、編輯模式
├── js/
│   ├── util.js           共用小工具：$、esc、postJson、題目 HTML、舊式分享連結編解碼
│   ├── vocab.js          共用：單字表、雙擊加字、文章標示、發音、浮動單字卡、字體大小（window.Vocab）
│   ├── host.js           主持人頁：設定記憶、產生文章（SSE）、預覽、分享連結
│   ├── paste-text.js     貼上文字的整理（純函式，有單元測試）：分段判斷
│   ├── host-paste.js     主持人頁：貼上文章
│   ├── host-edit.js      主持人頁：就地編輯
│   ├── host-library.js   主持人頁：文章庫（雲端／本機）、同步、備份
│   ├── host-main.js      主持人頁啟動（最後載入）
│   └── reader.js         成員閱讀頁
├── api/                  Vercel Serverless Functions（底線開頭的檔案不是路由）
│   ├── generate.js       POST 產生文章（存取碼、限流、SSE 串流）
│   ├── define.js         POST 查單字（公開、限流）
│   ├── library.js        POST 雲端文章庫（存取碼）：status/list/get/save/delete/diagnose
│   ├── article.js        GET 公開讀取單篇文章（短連結用）
│   ├── _groq.js          Groq 呼叫共用：請求、推理模型參數重試、串流讀取、錯誤訊息
│   ├── _model.js         模型相關設定：是否推理型、token 額度
│   ├── _prompt.js        輸入驗證與提示詞（程度描述、起承轉合段落規劃）
│   ├── _parse.js         解析 AI 回傳（分段純文字、容錯、段落整理）
│   ├── _store.js         Upstash Redis REST 儲存層
│   └── _util.js          存取碼比對、限流、body 讀取等
├── tests/api.test.js     後端單元測試（不需網路與金鑰）
├── docs/ARCHITECTURE.md  架構與資料流程
├── vercel.json           函式逾時上限
├── package.json          `npm test`、`npm run dev`
└── .env.example          環境變數範本
```

---

## 環境變數

| 名稱 | 必要 | 說明 |
|---|---|---|
| `GROQ_API_KEY` | ✅ | Groq 金鑰，到 https://console.groq.com/keys 申請（有免費額度） |
| `AI_MODEL` | ✅ | 模型名稱，例如 `llama-3.3-70b-versatile`。支援推理型模型（`openai/gpt-oss-*`、`qwen3-*`、`deepseek-r1-*`…），程式會自動降低思考量並加大 token 額度 |
| `HOST_CODE` | ✅ | 主持人存取碼（自訂一組難猜的字串） |
| `KV_REST_API_URL` / `KV_REST_API_TOKEN` | 選用 | 雲端文章庫（Upstash Redis）。也接受 `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN`，名稱可帶前綴（以結尾比對）；不會使用名稱含 `READ_ONLY` 的唯讀 token |

⚠️ 在 Vercel 新增或修改環境變數後，**必須 Redeploy** 才會生效。`.env` 已被 `.gitignore` 排除，請勿提交。

---

## 本機開發與測試

```bash
npm i -g vercel
cp .env.example .env     # 填入 GROQ_API_KEY / AI_MODEL / HOST_CODE
vercel dev               # 開啟 http://localhost:3000
```

### 單元測試（不需金鑰、不需網路）
```bash
npm test                 # = node --test tests/*.test.js
```
涵蓋 CSS 括號平衡檢查、輸入驗證、提示詞組裝、AI 回傳解析與容錯、段落整理、限流、存取碼比對，以及 `/api/generate`、`/api/define` 端點（以假的 `fetch` 取代 Groq）。

### 手動測試 API
```bash
# 產生文章（SSE：progress → result；失敗時是 error）
curl -N http://localhost:3000/api/generate -H 'Content-Type: application/json' \
  -d '{"code":"你的HOST_CODE","words":150,"level":"A2","topic":"a day at the market","genre":"story","questions":true,"discussion":true}'

# 查單字（公開端點）
curl http://localhost:3000/api/define -H 'Content-Type: application/json' \
  -d '{"word":"called","context":"My friend called me yesterday."}'
```

### 手動測試前端
1. 輸入存取碼、主題，按 **Generate**。
2. 雙擊文章中的字 → 右側單字表（窄螢幕是下方浮出的單字卡）出現新單字，文章中該字被標示。
3. 按 **Create share link**，在無痕視窗開啟連結，確認成員頁正常。
4. 用瀏覽器的裝置模擬（iPhone / iPad）檢查窄螢幕版面。

---

## 部署到 Vercel
1. 把專案推到 GitHub。
2. Vercel → Add New Project → 匯入此 repo（Framework 選 **Other**，不需 build）。
3. Settings → Environment Variables 加入 `GROQ_API_KEY`、`AI_MODEL`、`HOST_CODE`，然後 **Redeploy**。
4. 打開網站，輸入存取碼即可使用。推到 `main` 會自動重新部署。

---

## 雲端文章庫（選用，建議）

沒有設定時，文章庫存在各自瀏覽器，分享連結把整篇文章壓在網址裡（長連結）。設定雲端儲存後：
- 文章庫**跨裝置**：任何裝置輸入存取碼都看得到同一份。
- 分享連結變成**短連結**（`read.html?a=代碼`），內容永遠是最新版；主持人改單字、改文章，成員重新整理就看到；刪除文章後連結失效。
- 舊的長連結仍可使用。

設定步驟（免費）：
1. Vercel → 專案 → **Storage** → **Create Database** → 選 **Upstash**（Redis）→ 選免費方案 → 連結到此專案（Environments 全部勾選）。
   - 注意是 **Upstash**，不是清單裡另一項「Redis（Official Redis for Vercel）」：後者只有付費方案，連線方式（`REDIS_URL`）也和本專案不相容。
   - 方案選 **Free**；若有 High Availability 選項，選 None。
2. Vercel 會自動加入 `KV_REST_API_URL`、`KV_REST_API_TOKEN`。
3. **Redeploy**。重新整理主持人頁後，文章庫按鈕會變成 ☁ Library；舊的本機文章可按「Upload … from this browser」搬到雲端。

排查：輸入存取碼後打開 Library 面板，按「☁ Check cloud setup」，會列出伺服器找到的相關變數**名稱**與連線測試（不顯示任何值）。

資料結構：`rc:a:<代碼>` = 文章 JSON，`rc:idx` = 依更新時間排序的代碼清單。上限：500 篇、單篇約 12 萬字元。

---

### 貼上文字怎麼分段（`js/paste-text.js`）
先統一換行（含 U+2028／U+2029／`\r`），只有空白（含不斷行、全形空白）的行視為空行，然後：
1. **有空行** → 依空行分段，同一段內的單一換行接成一行（視為硬換行）。
2. **沒有空行、只有單一換行** → 自動判斷：
   - 至少 3 行、多數行停在句子中間（沒有句尾標點）、而且各行長度相近 → 視為**固定寬度硬換行**（PDF、email、純文字檔），整篇接成一段；
   - 其他情況（有標題、兩行、各行長短不一、都有句尾標點…）→ **每行一段**。
3. 自動判斷不符合你的來源時，用 Paragraphs 選單手動指定。選擇會和草稿一起記住，按 Clear 回到 Auto-detect。

## 安全設計
- 金鑰、存取碼只在伺服器端環境變數；前端只把使用者輸入的存取碼送到 API，比對時用雜湊 + `timingSafeEqual`。
- 產生文章與文章庫的清單／寫入都要存取碼；成員只能用「猜不到的 12 字元代碼」讀單篇文章。
- `/api/define` 不需存取碼（成員要用），以單字格式檢查、每 IP 每分鐘 30 次、小 token 上限防濫用。
- 使用者輸入（主題、單字、語境）都當成「資料」放進 JSON，提示詞明確要求不得遵從其中的指令。
- 文章中的網址只允許 `http/https`，連結以 `rel="noopener noreferrer"` 在新分頁開啟；所有插入 HTML 的文字都經過跳脫。

## 已知限制
- **限流**存在函式記憶體：多實例不共享、冷啟動會重置，只能擋一般濫用，不是嚴格限制。
- **字數**：為了串流與避免逾時，超出目標 ±10% 時不自動重試，只回報實際字數並在預覽提示，可按「Regenerate」。
- **長連結**（本機模式）：文章越長連結越長，超過約 8000 字元時部分通訊軟體可能截斷。
- **發音**依賴瀏覽器內建語音（各裝置音色不同；裝置需開啟聲音）。
- 雙擊／雙點由程式自己計時（500ms）判斷，不依賴 `dblclick`（iPad Safari 不可靠）。
- 介面為英文。

## 疑難排解
| 現象 | 原因／處理 |
|---|---|
| `Server is missing environment variables: …` | 缺少 `GROQ_API_KEY`／`AI_MODEL`／`HOST_CODE`；設定後 Redeploy |
| `AI model not found` | `AI_MODEL` 名稱不存在；到 Groq 文件確認目前可用的模型 |
| `Incorrect access code` | 存取碼錯誤（輸入框已自動清空） |
| `The AI response was incomplete …` | 錯誤訊息會附上原因與模型名稱；推理型模型可能把 token 用在思考，減少字數或改用非推理型模型 |
| 圖示是 📚 而不是 ☁ | 雲端沒啟用：按「☁ Check cloud setup」看伺服器找到哪些變數，連結 Upstash 後 Redeploy |
| 手機點單字沒有發音 | 確認裝置沒有靜音、瀏覽器支援語音合成 |
