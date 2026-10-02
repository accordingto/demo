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
- 主持人頁：`util.js` → `vocab.js` → `host.js` → `host-paste.js` → `host-edit.js` → `host-library.js` → `host-main.js`
- 閱讀頁：`util.js` → `vocab.js` → `reader.js`

各 host 模組之間的函式只在**執行時**互相呼叫；但 `Vocab.init` 一執行就會呼叫 `onChange(syncLib)`，所以放在最後載入的 `host-main.js`。

### 主持人頁的全域狀態
| 變數 | 檔案 | 意義 |
|---|---|---|
| `current` | host.js | 目前預覽的文章 |
| `currentLibId` | host.js | 文章在文章庫中的 id（有值才會自動同步單字表） |
| `editState` | host-edit.js | 編輯中的狀態（`dirty`、`libId`） |
| `cloud` / `cloudItems` / `cloudErr` | host-library.js | 是否用雲端文章庫、清單、最近錯誤 |

### `Vocab`（`js/vocab.js`）— 兩頁共用的單字功能
`window.Vocab`：`init({getBody,onChange})`、`getItems`、`setItems`、`repaint`、`freeze(on)`、`fillWord`。

重點機制：
- **文章繪製**（`paintBody`）：每段 → 句子 `span.s` → 單字 `span.w`／已加入的 `mark.vh`；網址先換成佔位符再還原成 `a.ulink`，避免被拆字或被句號切句。
- **點擊**：自己用時間差（500ms）判斷連點兩下 → 加入單字；單擊 → 發音。
- **單字卡**：`open`／`pinned`／`loading`／`failed`；`complete(v)` = 英文與中文都有；完整後才開始 5 秒收合倒數；缺資訊會自動重查一次，仍缺則保持展開並提示。
- **標示**：`pick`／`applyActive` 把某個字在文章中的每一處標成橘色、所在句子淡橘底；`‹ ›` 逐一跳轉。
- **浮動單字卡**（窄螢幕）：`showPop`／`updatePop`／`hidePop`；與清單卡片共用 `detailOf(v)` 產生內容。
- `freeze(true)`：編輯期間暫停重畫文章。

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
- `npm test`：後端單元測試與端點測試（假的 `fetch`，不需金鑰）。
- 前端目前以手動 / 瀏覽器自動化（Playwright）驗證：產生、雙擊加字、單字卡收合、編輯、文章庫、分享連結、窄螢幕浮動單字卡。

## 常見修改位置
| 想做的事 | 改哪裡 |
|---|---|
| 調整文章品質／提示詞 | `api/_prompt.js` |
| 支援別的模型或參數 | `api/_model.js`、`api/_groq.js` |
| 加新的文體 | `_prompt.js` 的 `GENRES`、`ARC`；`index.html` 的 `#genre` 選項 |
| 調整單字卡行為 | `js/vocab.js` |
| 改版面／顏色 | `css/shared.css`（兩頁）、`css/host.css`（主持人頁） |
| 換儲存方式 | 實作與 `_store.js` 相同介面（`configured`、`cmd`、`pipeline`），`library.js`／`article.js` 不需動 |
