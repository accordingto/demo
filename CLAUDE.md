# CLAUDE.md

純前端（HTML/CSS/原生 JS）+ Vercel Serverless Functions（Node.js，零 npm 相依）。詳細說明見 README.md 與 docs/ARCHITECTURE.md。

## Commands
```bash
npm test          # node --test tests/*.test.js （後端單元測試，不需金鑰、不需網路）
vercel dev        # 本機執行（需 .env：GROQ_API_KEY / AI_MODEL / HOST_CODE）
```

## 慣例
- 介面文字為英文；程式註解用繁體中文、保持簡短。
- 金鑰與存取碼只能在環境變數，絕不寫進前端或 repo；不要提交 `.env`。
- `api/` 內底線開頭的檔案是共用模組，不會成為路由。
- 前端是 classic script（共用全域作用域），載入順序見 docs/ARCHITECTURE.md；`Vocab.init` 必須最後執行。
- 改動前端行為後，請在窄螢幕（393px）與桌面（≥1100px）都確認一次。
- 不要自行建立 PR；使用者要求時才推到 `main`（Vercel 自動部署）。
