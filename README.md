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

### 介面設計（主持人頁）
為了在電腦、平板、手機都順手，介面分成「三個畫面」，用導覽切換，不再把所有東西擠在同一頁：

| 畫面 | 內容 |
|---|---|
| **Create** | 三個分頁：**Generate**（主題、字數、文體、CEFR 程度、題目開關）、**Paste text**（貼上文字）、**From a link**（從網址匯入，有預覽卡） |
| **Article** | 文章（朗讀、閱讀設定、Edit／Save／Regenerate／Share）與單字表 |
| **Library** | 已存文章的卡片牆，可搜尋；開啟、編輯、複製連結、刪除；備份與雲端設定工具 |

**導覽方式（依螢幕寬度）**
- **≥ 1280px（桌機）**：左側固定側邊欄，常駐顯示 Create／Article／Library、閱讀設定與存取碼。
- **< 1280px（平板、手機）**：上方只有一條窄列（☰、目前畫面名稱、⚙）；點 ☰ 從左邊滑出同一份選單（抽屜），點選項目、點遮罩、按 Esc 或 ✕ 都會收起。
- 存取碼放在側邊欄底部，輸入一次就會記住；需要存取碼卻沒填（或填錯）時，會自動打開選單並對焦到存取碼欄位。
- 瀏覽器的「上一頁」會回到上一個畫面（網址的 `#create`／`#library`）。

**為什麼這樣設計**：側邊欄在寬螢幕不佔用文章的閱讀空間（兩欄式的文章＋單字表仍能保持足夠寬度），也不需要先點開才能切換；窄螢幕改成抽屜，才不會讓手機橫向被側邊欄吃掉一半寬度。兩種模式用的是同一份選單標記，只有版面不同，所以只需維護一份。

### 主持人頁（`index.html`）
| 功能 | 說明 |
|---|---|
| 產生文章 | 字數 100–1000（▲▼ 或方向鍵每次 ±100，預設 300）、主題、CEFR A1–C2、文體（15 種，見下）、理解題 2 題、討論題 2 題；以串流顯示進度 |
| 貼上文章 | Create →「Paste text」分頁貼上自己的文章（20–8000 字，不呼叫 AI、不需存取碼），可附題目（每行一題）。**Paragraphs** 選單決定怎麼分段：*Auto-detect*（預設）／*Every line break starts a paragraph*／*Only blank lines start a paragraph*；面板上方會即時顯示字數與段落數（自動模式也顯示判斷結果） |
| 從網址匯入 | Create →「From a link」分頁貼上文章網址，按 **Import**：後端抓網頁，**自動擷取最重要的文章內容**（標題與本文，去掉導覽列、廣告、訂閱、版權等雜訊），先顯示**預覽卡**（網站、字數、標題、開頭摘要），再選 **Use this article** 直接使用，或 **Review & edit text** 到 Paste 分頁修改。需要存取碼。限制見下方「從網址匯入」 |
| 就地編輯 | 「✍ Edit」直接在畫面上改標題、本文、題目（所見即所得、只接受純文字）；Ctrl/⌘+S 儲存 |
| 單字表 | 在文章上**連點兩下**單字加入（沒有手動輸入框）；單字卡右上角 × 會先跳出確認才刪除；由 AI 查出詞性、KK 音標、英文解釋、中文翻譯 |
| 朗讀文章 | 標題右上角、齒輪左邊的 ▶ **朗讀全文**；每個段落前面的 ▶ **從該段開始一路往下念到最後一段**（例如十段的文章，在第五段按 ▶，就從第五段念到第十段；用瀏覽器內建語音，免費、不需 API）。朗讀中按鈕變成 ⏸，按一下暫停、再按一下從暫停的那一句繼續；**念到哪裡，哪個字就變色（綠底）、那個字所在的句子有底色**，並自動捲動跟著走。朗讀中點另一段的 ▶ 會改從那一段開始；點文章中的單字、按 Esc、進入編輯模式或換文章都會停止。語速與口音用設定視窗（⚙ → Pronunciation）調整 |
| 發音 | 點文章中**任何單字**、點單字卡、點浮動單字卡，都會用瀏覽器內建語音（免費、不需 API）朗讀；被點到的字會有約 1 秒的綠色光圈與底色回饋，讓你知道點了哪個字 |
| 文章標示 | 已加入的字在文章中以藍色底色標示（含變化形，如 called → call）。**點文章中的任何單字**：發音、播放約 1 秒光圈，並關閉所有單字卡；如果是已加入的字，改為打開它的單字卡，文章中這個字的每一處換成橘色，3 秒後卡片收起、橘色恢復（窄螢幕＝浮動單字卡消失時恢復）。**點右側單字卡**：發音、展開這張並收起其他張，文章中這個字換成橘色（不標整句、不移動畫面），橘色保留到下一次點擊文章或按 Esc |
| 單字卡 | 剛加入時完整展開；英文與中文都取得後 5 秒自動收成第一行；沒有箭頭，點卡片展開（同時只會展開一張，其他自動收起）|
| 文章庫 | 儲存文章與單字；雲端模式跨裝置，本機模式可匯出／匯入備份。**新增或刪除單字會自動存檔**：文章還沒存過就自動存成新文章（雲端模式需已輸入存取碼），已存過的就更新同一篇；只產生或開啟文章不會存 |
| 分享 | 「Create share link」：雲端為短連結 `read.html?a=<代碼>`，本機為把整篇文章壓進網址的長連結 |
| 閱讀設定 ⚙ | 文章標題右上角的齒輪（見下方「閱讀設定」）；另外，產生文章的設定（存取碼、主題、字數…）會自動記住 |

### 成員閱讀頁（`read.html`）
與主持人頁相同的版面與單字功能。主持人挑的單字顯示為鎖定的單字卡；成員自己加的單字只存在自己的瀏覽器。

### 手機／平板直放
- 寬度 ≥ 1100px：左＝文章、右＝固定的單字表（沒有單字也保留這個區塊）
- 寬度 < 1100px：單字表排在文章下面（看不到），所以加入單字或點已標示的字時，會從畫面下方**浮出單字卡**；英文與中文都取得後 5 秒自動消失，點卡片可固定住，✕／Esc 關閉；點文章中其他單字會立刻關閉它
- 觸控裝置：輸入框 16px（避免 iOS 自動放大）、按鈕與可點區域 ≥ 44px

---

### 從網址匯入
`POST /api/extract`（需存取碼，每 IP 每分鐘 10 次）：
1. **安全抓取**（`api/_fetch.js`）：只允許 `http`／`https` 與 80／443 埠；不允許帳密、`localhost`、內部網域；**連線時**檢查實際連到的 IP，不是本機、內網（10／172.16／192.168）、連結本地（含雲端中繼資料位址 `169.254.169.254`）、CGNAT 等（防 DNS rebinding）；轉址最多 4 次，**每一次都重新檢查**；只收 HTML／純文字、最大 2 MB、10 秒逾時；支援 gzip／deflate／br 與常見字元編碼。
2. **擷取文章**（`api/_extract.js`，沒有任何相依套件）：移除 script／style／導覽／頁尾／側欄／表單等；有 `<article>` 就優先在最大的那個裡找；把 `<p>`（與夠長的清單項目）依距離分群，**取字數最多的一群**當文章本體，補回其中的小標題（`h2`–`h4`）、引言與清單；濾掉廣告、訂閱、版權、分享等雜訊與重複段落；標題取 `og:title` → `<h1>` → `<title>`（去掉「｜網站名稱」）；超過 8000 字會在段落邊界截斷。
3. 回傳標題與純文字，前端填進貼上面板，由你確認後再使用（之後和貼上的文章完全相同：單字、朗讀、文章庫、分享連結）。

限制：靠 JavaScript 動態載入內容的網站（SPA）、需要登入或付費牆的頁面、擋機器人的網站抓不到內容，會顯示錯誤，改用「複製文字 → Paste」。只做簡易版面分析，版面特殊的網站可能多抓或少抓一些，匯入後可直接在文字框修改。請尊重網站著作權，僅供個人學習使用。

### 文體（Genre）
| 分類 | 文體 |
|---|---|
| Informational | Explanation、Science（科普）、History、Biography、How-to guide、Travel、News style |
| Narrative | Story、Fable（寓言，結尾點出寓意） |
| Analytical | **Analyst briefing**（分析師條列：以分析師角度分析問題，並用「1. … 2. …」條列回答；每一點是獨立一段，各有播放鍵） |
| Personal & opinion | Blog / diary、Letter / email、Opinion（社論）、Review、Speech |

另有 *Any*（由 AI 決定）。

**Analyst briefing** 和其他文體不同：不寫連貫的段落，而是 **編號條列**（點數約每 80 字一點，3–10 點）。每一點先用一句標題句講出重點，再接 1–3 句說明或例子；順序依序是「界定問題 → 關鍵發現或成因 → 風險與取捨 → 結論與建議」。提示詞要求不得捏造精確統計或引用。後端（`normalizeNumbered`）會把編號整理成「一點一段」，AI 沒有編號時會自動補上。每種文體都有各自的「起承轉合」段落規劃（`api/_prompt.js` 的 `ARC`），例如 Opinion 是「立場 → 理由 → 回應反方 → 重申與呼籲」，Review 是「第一印象 → 優點 → 缺點 → 總評與適合誰」。**新增文體**：在 `GENRES` 與 `ARC` 各加一筆，並在 `index.html` 的 `#genre` 加選項（單元測試會檢查三者一致）。

### 閱讀設定（⚙，兩頁共用）
點文章標題右上角的齒輪（還沒有文章時，在預覽區右上角也有一個），會浮出設定視窗；每一項都**即時生效**，並記在這個瀏覽器（`localStorage` 的 `rc-prefs`，主持人頁與閱讀頁共用）。Esc、×、再按齒輪或點視窗外面可關閉；**Reset** 回到預設。

| 分類 | 設定 |
|---|---|
| **Theme** | Dark（預設）、Night（純黑）、Gray（柔和深灰）、Light（白底黑字）、Paper（類紙張底色＋黑字）、Sepia（褐色護眼）、Contrast（高對比黑底黃字）；套用到整個網站（也會更新手機瀏覽器的網址列顏色） |
| **Text** | 文字大小 12–40px（滑桿與 A−／A+，題目一起放大）、字型（Sans／Serif／Wide／Friendly／Mono）、行距、段落間距、字距、文字寬度（Narrow／Medium／Wide／Full，像書頁一樣置中）、對齊（Left／Justified） |
| **Display** | 螢幕調暗、暖色光（降低藍光）、是否標示已加入的單字、動畫開關（預設會跟隨系統的「減少動態效果」） |
| **Pronunciation** | 點字是否發音、美式／英式口音、語速（也用於朗讀文章）、Test 按鈕 |

字型只用各系統內建的字型（不下載網頁字型）：Friendly 會用 OpenDyslexic（如果裝置有）或 Comic 系字型。

## 專案結構

```
.
├── index.html            主持人頁（側邊欄／上方列＋三個畫面的版面標記）
├── read.html             成員閱讀頁（只有版面標記）
├── css/
│   ├── themes.css        色彩主題（7 種）與閱讀偏好變數（字型、行距、寬度、調暗／暖色）
│   ├── settings.css      齒輪按鈕與閱讀設定視窗
│   ├── app.css           主持人頁外殼：側邊欄／抽屜、上方列、三個畫面、Create／Library 版型
│   ├── shared.css        兩頁共用：版面、文章、單字卡、浮動單字卡、列印樣式（瀏覽器 Ctrl/⌘+P）；顏色一律用主題變數
│   └── host.css          主持人頁專用：數字上下調整、貼上／網址匯入、編輯模式
├── js/
│   ├── prefs.js          閱讀偏好（放在 <head>，頁面繪製前就套用主題）：window.Prefs
│   ├── settings.js       閱讀設定視窗（齒輪）
│   ├── tts.js            語音合成的共用部分（口音、語速、語音）
│   ├── readaloud.js      朗讀全文／朗讀單一段落（播放、暫停、繼續）
│   ├── util.js           共用小工具：$、esc、postJson、題目 HTML、舊式分享連結編解碼
│   ├── vocab.js          共用：單字表、雙擊加字、文章標示、發音、浮動單字卡（window.Vocab）
│   ├── host-nav.js       主持人頁導覽：畫面切換（showView）、Create 分頁（showTab）、抽屜
│   ├── host.js           主持人頁：設定記憶、產生文章（SSE）、預覽、分享連結
│   ├── paste-text.js     貼上文字的整理（純函式，有單元測試）：分段判斷
│   ├── host-paste.js     主持人頁：貼上文章
│   ├── host-edit.js      主持人頁：就地編輯
│   ├── host-library.js   主持人頁：文章庫（雲端／本機）、同步、備份
│   ├── host-main.js      主持人頁啟動（最後載入）
│   └── reader.js         成員閱讀頁
├── api/                  Vercel Serverless Functions（底線開頭的檔案不是路由）
│   ├── extract.js        POST 貼上網址 → 擷取網頁主要文章（存取碼、限流）
│   ├── generate.js       POST 產生文章（存取碼、限流、SSE 串流）
│   ├── define.js         POST 查單字（公開、限流）
│   ├── library.js        POST 雲端文章庫（存取碼）：status/list/get/save/delete/diagnose
│   ├── article.js        GET 公開讀取單篇文章（短連結用）
│   ├── _groq.js          Groq 呼叫共用：請求、推理模型參數重試、串流讀取、錯誤訊息
│   ├── _model.js         模型相關設定：是否推理型、token 額度
│   ├── _prompt.js        輸入驗證與提示詞（程度描述、起承轉合段落規劃）
│   ├── _fetch.js         安全地抓取使用者給的網址（防 SSRF）
│   ├── _extract.js       從 HTML 擷取主要文章（簡易 Readability）
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
