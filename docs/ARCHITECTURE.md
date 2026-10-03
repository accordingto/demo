# 架構說明

## 總覽

```
 瀏覽器                                      Vercel Serverless (Node.js)                外部服務
┌─────────────────────────┐   POST /api/generate (SSE)   ┌───────────────────┐
│ index.html  (主持人)     │ ───────────────────────────▶ │ generate.js       │ ──▶ Groq chat completions
│  js/host*.js            │   POST /api/define           │ define.js         │ ──▶ Groq (JSON 模式)
│  js/vocab.js, util.js   │ ───────────────────────────▶ │                   │
│                         │   POST /api/library          │ library.js        │ ──▶ Upstash Redis (REST)
├─────────────────────────┤ ───────────────────────────▶ │                   │
│ read.html   (成員)       │   GET  /api/article?id=      │ article.js        │ ──▶ Upstash Redis (REST)
│  js/reader.js + 共用     │ ───────────────────────────▶ └───────────────────┘
└─────────────────────────┘
```

沒有資料庫以外的狀態；沒有 session。主持人身分 = 「請求中帶了正確的存取碼」。

## 後端（`api/`）

| 檔案 | 職責 |
|---|---|
| `generate.js` | 檢查環境變數 → 比對存取碼 → 限流 → `validate` → 呼叫 Groq（串流）→ `parseArticle` → 以 SSE 回傳 `progress`／`result`／`error` |
| `define.js` | 公開。驗證單字格式 → 限流 → Groq JSON 模式 → 回傳 `{lemma,pos,kk,definition,zh}`（欄位都限制長度） |
| `library.js` | 需存取碼。`status`（不需碼，回報雲端是否啟用）、`diagnose`、`list`、`get`、`save`、`delete` |
| `article.js` | 公開 GET。以 12 字元代碼讀單篇文章與主持人挑的單字，`Cache-Control: no-store` |
| `_groq.js` | `groqChat`（送請求；推理型模型的參數被拒絕時不帶參數重試）、`readStream`（解析 SSE，回傳 `{text, finish}`）、`errorMessage` |
| `_model.js` | `modelName`、`isReasoning`、`reasoningParams`、`articleTokens` |
| `_prompt.js` | `validate`、`buildMessages`；程度描述 `LEVEL_GUIDE`、文體的起承轉合 `ARC`、`paragraphCount`、`arcPlan` |
| `_parse.js` | `parseArticle`（分段純文字 → 文章，含各種容錯）、`normalizeParagraphs`（一句一段時依字數重新合併） |
| `_store.js` | Upstash REST：`configured`、`conf`（以名稱結尾比對環境變數）、`cmd`、`pipeline`、`KEY`、`INDEX` |
| `_util.js` | `safeEqual`（雜湊後 `timingSafeEqual`）、`makeLimiter`、`clientIp`、`readBody`、`clip`、`ID_RE`、`missingEnv` |

> 檔名以底線開頭的檔案，Vercel 不會當成 API 路由。

### 為什麼 AI 回傳不用 JSON？
長文裡的引號、換行容易讓 JSON 壞掉（尤其是故事）。改用分隔標記：

```
=== TITLE ===
…
=== BODY ===
…（段落以空行分隔）
=== QUESTIONS ===
1. …
=== DISCUSSION ===
1. …
```
`_parse.js` 對標記改名、完全沒有標記、被 token 上限截斷等情況都有容錯，並把原因寫進錯誤訊息。

### 提示詞怎麼組成
1. **系統提示**：角色、輸出格式、寫作品質規則（真正的段落、起承轉合、過渡語）。
2. **使用者提示**：設定 JSON（主題只當資料）、CEFR 程度描述、目標字數範圍、**段落數與每段的角色**（`arcPlan`）、題目要求。
3. 段落數 = 字數 ÷ 110（2–12 段）；每段句數依程度的平均句長推算。

### 推理型模型
`isReasoning(model)` 為真時：`reasoning_effort` 設為 low／none、token 額度加 6000；若模型回 400（不接受該參數）就不帶參數重試。思考過程不採用，只用來更新進度。

### 資料格式（Upstash）
- `rc:a:<id>`：`{ id, createdAt, updatedAt, article:{title,body,level,source,wordCount,targetWords,questions[],discussion[]}, vocab:[{word,pos,definition,zh,kk,lemma}] }`
- `rc:idx`：sorted set，member = id，score = updatedAt。

## 前端

### 載入順序（classic script，共用全域作用域）
- 共通：`prefs.js` 放在 `<head>`（同步載入，頁面繪製前就套用主題，避免先閃一下預設主題）
- 主持人頁：`util.js` → `tts.js` → `vocab.js` → `settings.js` → `readaloud.js` → `host.js` → `paste-text.js` → `host-paste.js` → `host-edit.js` → `host-library.js` → `host-main.js`
- 閱讀頁：`util.js` → `tts.js` → `vocab.js` → `settings.js` → `readaloud.js` → `reader.js`

各 host 模組之間的函式只在**執行時**互相呼叫；但 `Vocab.init` 一執行就會呼叫 `onChange(syncLib)`，所以放在最後載入的 `host-main.js`。

### 主持人頁的全域狀態
| 變數 | 檔案 | 意義 |
|---|---|---|
| `current` | host.js | 目前預覽的文章 |
| `currentLibId` | host.js | 文章在文章庫中的 id（有值才會自動同步單字表） |
| `editState` | host-edit.js | 編輯中的狀態（`dirty`、`libId`） |
| `cloud` / `cloudItems` / `cloudErr` | host-library.js | 是否用雲端文章庫、清單、最近錯誤 |
| `vocabSig` | host-library.js | 上次存檔時單字表的簽名；`syncLib` 比對它才知道單字表是否真的有增減（有增減 → 自動存檔，沒存過的文章自動建立） |

### `Vocab`（`js/vocab.js`）— 兩頁共用的單字功能
`window.Vocab`：`init({getBody,onChange})`、`getItems`、`setItems`、`repaint`、`freeze(on)`、`fillWord`。

重點機制：
- **文章繪製**（`paintBody`）：每段 → 單字 `span.w`／已加入的 `mark.vh`；網址先換成佔位符再還原成 `a.ulink`，避免被拆字或被句號切句。
- **點擊**：自己用時間差（500ms）判斷連點兩下 → 加入單字；單擊 → 發音。
- **單字卡**：`open`／`pinned`／`loading`／`failed`；`complete(v)` = 英文與中文都有；完整後才開始 5 秒收合倒數；缺資訊會自動重查一次，仍缺則保持展開並提示。
- **點擊規則**：點文章單字 → `speak` + `closeAll`（收起所有卡片、關浮動卡、清橘色）；若是已加入的字再 `reveal`／`showPop` 並 `highlight(v, auto=true)`（光圈結束時收卡、清色）。點單字卡 → `speak`、`reveal(v, true)`（固定並收起其他）、`highlight(v)`（橘色保留到下一次點擊）。沒有捲動、沒有整句標示。
- **浮動單字卡**（窄螢幕）：`showPop`／`updatePop`／`hidePop`；與清單卡片共用 `detailOf(v)` 產生內容。
- `freeze(true)`：編輯期間暫停重畫文章。

### 閱讀偏好與主題（`prefs.js`、`settings.js`、`css/themes.css`）
- `Prefs` 保存一個物件（`localStorage['rc-prefs']`），`clean()` 負責驗證（數值夾在範圍內、列舉值只接受白名單）；`set(patch)` → 存檔 → `apply()` → 通知監聽者。其他分頁改了設定會透過 `storage` 事件同步。
- `apply()` 把偏好寫成 `<html>` 上的 `data-theme`／`data-align`／`data-hl`／`data-anim` 與 CSS 變數（`--fs`、`--lh`、`--para`、`--ls`、`--align`、`--measure`、`--reader-font`、`--dim`、`--warm`）。
- 主題只是 `themes.css` 裡的一組顏色變數（`--bg`、`--card`、`--ink`、`--accent`、`--mark-bg`、`--cur-bg`…）；其他 CSS 一律用變數、不寫死顏色。**新增主題**：在 `themes.css` 加一個 `html[data-theme="x"]` 區塊，並在 `prefs.js` 的 `THEMES` 加一筆（`id`、`label` 與色票顏色）。
- 調暗與暖色用 `html::before`／`html::after` 兩個蓋在整個畫面上的偽元素（`pointer-events:none`）實作。
- `settings.js` 依 `SECTIONS` 設定表產生視窗內容；**新增設定項**：在 `prefs.js` 的 `DEFAULTS`／`clean()` 加欄位、在 `apply()` 套用，再在 `SECTIONS` 加一列。
- `vocab.js` 的 `speak()` 讀取 `Prefs`（開關、速度、口音）。

### 朗讀（`tts.js`、`readaloud.js`）
- `TTS.utter(text)` 依 `Prefs`（口音、語速）建立語音；點字發音（`vocab.js` 的 `speak`）與朗讀共用。
- `ReadAloud` 是一個小狀態機：`status`（idle／playing／paused）、`p`／`s`／`w`（目前段落／句子／字）；`start(p)` 從第 p 段開始一路念到最後一段（全文 = `start(0)`）。文章被切成句子逐句念（避免部分瀏覽器念太長會被截斷），`gen` 計數器讓被取消的語音事件失效。
- **暫停 = 取消語音並記住位置，繼續 = 從這一句重新念**；不用 `speechSynthesis.pause()`，因為各平台（特別是 Android）不可靠。
- 段落按鈕由 `vocab.js` 的 `paintBody` 產生（`<p>` 裡的 `.pread`）；每次重畫文章會送出 `bodypainted` 事件，`ReadAloud` 據此重新標示狀態，若文章內容變了就停止。段落文字來自 `Vocab.paragraphs()`（與畫面分段一致）；網址朗讀成「link」。
- **逐字標示**：文章畫成 段落 → 句子 `span.s` → 單字 `span.w`（網址是 `a.ulink`）。`Vocab.paragraphSentences()` 與畫面上的 `span.s` 一一對應，`ReadAloud` 逐句朗讀並把目前句子加上 `.speaking`。字的位置優先用語音的 `boundary` 事件（`charIndex`）對到第幾個字；瀏覽器沒回報（部分 Android 語音）就依語速每 60000/(165×速度) 毫秒推進一個字。念出的字數與畫面上的字數對不起來時，只標示句子。
- 瀏覽器不支援語音合成時，所有朗讀按鈕自動隱藏。

### 兩種分享連結
| | 雲端（建議） | 本機 |
|---|---|---|
| 形式 | `read.html?a=<12 字元代碼>` | `read.html#z.<deflate-raw + base64url>` |
| 內容 | 存在 Upstash，永遠最新版 | 整篇文章在網址裡，不會送到伺服器 |
| 更新 | 主持人改文章／單字後自動更新 | 要重新產生連結 |

### CSS 斷點
| 寬度 | 變化 |
|---|---|
| ≥ 1100px | 兩欄：文章｜固定的單字表（360px） |
| < 1100px | 單字表排到文章下方；使用浮動單字卡（`util.js` 的 `narrowQuery`） |
| ≥ 1040px | 設定列單行；< 640px 手機版面（欄位兩兩並排、按鈕滿版） |
| `pointer:coarse` 或 < 640px | 16px 輸入框、44px 可點區域（避免 iOS 自動放大） |

## 測試
- `npm test`：後端單元測試與端點測試（假的 `fetch`，不需金鑰），以及 `js/paste-text.js` 的貼上分段測試。
- 前端目前以手動 / 瀏覽器自動化（Playwright）驗證：產生、雙擊加字、單字卡收合、編輯、文章庫、分享連結、窄螢幕浮動單字卡。

## 常見修改位置
| 想做的事 | 改哪裡 |
|---|---|
| 調整文章品質／提示詞 | `api/_prompt.js` |
| 支援別的模型或參數 | `api/_model.js`、`api/_groq.js` |
| 加新的文體 | `_prompt.js` 的 `GENRES`、`ARC`；`index.html` 的 `#genre` 選項（測試檢查三者一致） |
| 調整單字卡行為 | `js/vocab.js` |
| 改版面 | `css/shared.css`（兩頁）、`css/host.css`（主持人頁） |
| 改顏色／新增主題、閱讀設定項 | `css/themes.css`、`js/prefs.js`、`js/settings.js` |
| 換儲存方式 | 實作與 `_store.js` 相同介面（`configured`、`cmd`、`pipeline`），`library.js`／`article.js` 不需動 |
