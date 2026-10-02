// 主持人頁的啟動：最後載入。單字表第一次繪製就會呼叫 syncLib，所以要等所有檔案都載入後才初始化。
Vocab.init({ getBody: () => current?.body, onChange: syncLib });   // 單字表／雙擊加字／標示／字體大小（共用 vocab.js）
