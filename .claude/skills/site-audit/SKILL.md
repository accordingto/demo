---
name: site-audit
description: 全站健康檢查與整理。使用者說「檢查整個網站」「全站檢查」「確認 PC／iPad／iPhone 排版」「清理沒用到的程式碼」「重構／整理程式碼」，或輸入 /site-audit 時使用。依序做：自動測試、死碼掃描、16 種裝置尺寸 × 中英文的排版檢查、修正、驗證、提交推送，最後用繁體中文回報。
---

# 全站檢查（site-audit）

這個網站（英文讀書會）是純前端＋Vercel Serverless，零 npm 相依。這份流程把「檢查整個網站、確認各裝置排版、清理死碼、整理程式碼」固定下來，每次照同一套標準做。

## 0. 先讀規則
- 讀 `CLAUDE.md`（專案慣例：介面文字要補 `js/i18n-zh.js`、顏色只能用 `css/themes.css` 的變數、抓網址一律走 `api/_fetch.js`、不要自行建立 PR）。
- `git status` 確認工作區乾淨；有別人的未提交改動就先問使用者。

## 1. 自動測試
```bash
npm test
```
有失敗就先修，修好才繼續。

## 2. 死碼掃描
```bash
npm run audit:code
```
- 列出：前端只宣告沒使用的函式／常數、沒被引用的元素 id、沒用到的 CSS class、沒用到的 SVG 圖示、後端沒人匯入的匯出。
- **逐項人工確認**再刪（名稱可能是字串組出來的）。刪完再跑一次 `npm test`。

## 3. 排版檢查（PC、iPad 直式／橫式、iPhone）
```bash
NODE_PATH=$(npm root -g) npm run audit:layout          # 預設中英文都測
NODE_PATH=$(npm root -g) npm run audit:layout -- --langs en   # 只測英文（比較快）
```
- 不需要金鑰、不連外網：`scripts/audit/server.js` 會在本機起一個伺服器，內含假的雲端資料庫與假的 AI 回應，並先建好使用者與文章。
- 尺寸：PC 1920／1536／1440／1366／1280；iPad mini、Air、Pro 11、Pro 13 的直式與橫式；iPhone SE／15／15 Pro Max。
- 畫面：Guide、Create（選擇、AI generate、Paste text、From a link）、Article（含單字表）、Library、Users、閱讀設定。
- 會找出：超出畫面左右的元素、整頁左右捲動、JavaScript 錯誤。代表性尺寸的截圖在 `audit-out/`（已在 .gitignore），**要打開幾張看**（文字重疊、按鈕擠壓、留白異常這類問題腳本抓不到）。
- 這個腳本執行約 5 分鐘，請用背景執行，等通知；不要用 sleep 輪詢。
- 修排版時：一律用主題變數；改完 CSS 跑 `npm test`（檢查括號平衡）；重跑 `audit:layout` 確認 0 個問題。

## 4. 重構與整理
- **小而安全的整理可以直接做**：重複的程式碼抽成函式、過時的註解、命名不一致、沒用到的參數。
- **大規模重構（改檔案結構、改資料格式、改畫面結構、一次動很多檔）不要直接做**：先列出建議、說明風險，等使用者同意。這個網站曾經因為一次大改版被要求整個退回。
- 任何新增或修改的介面文字，都要在 `js/i18n-zh.js` 補中文。
- 若改了程式行為或檔案結構，同步更新 `README.md` 與 `docs/ARCHITECTURE.md`。

## 5. 驗證與提交
1. `npm test` 全部通過、`audit:code` 沒有新的項目、`audit:layout` 沒有問題。
2. 提交到工作分支，並推到 `main`（Vercel 自動部署）：
   ```bash
   git push -u origin <工作分支> && git push origin <工作分支>:main
   ```
3. 不要自行建立 PR。

## 6. 回報（繁體中文）
- 檢查了什麼（測試數、死碼項目數、排版：幾種尺寸 × 語言 × 畫面）。
- 找到並修好的問題，每項一句（在哪個裝置、哪個畫面、怎麼了）。
- 刪掉了哪些程式碼。
- 沒有做、需要使用者決定的事（例如較大的重構建議）。
- 限制：排版是用 Chromium 模擬尺寸，不是真的 iPad／iPhone Safari，請使用者在實機上抽看。
