# Archify 流程圖

指揮中心 → 營運 → 流程 FLOW 清單裡，排在可編輯的「專案管理流程」下面的三張唯讀圖，都由 [Archify](https://github.com/tt-a1i/archify) 產生。
清單在 `src/components/WorkflowCharts.tsx` 的 `STATIC_FLOWS`。點開後滿版顯示。

| 檔案 | 說明 |
| --- | --- |
| `pm-overview.workflow.json` | 專案管理流程總覽（有設計）：5 個階段 × 6 個關鍵步驟、決策關卡與退回路徑 |
| `pm-overview.build.mjs` | 產生上面 JSON 的腳本 |
| `construction.build.mjs` | 工程承攬流程（沒有設計，拾壤是工程管理單位，泥作／土作由自有工班施作）。8 個階段 × 6 個步驟，每個階段附「會遇到的問題」卡片 |
| `construction-1.workflow.json` | 工程承攬流程（一）接洽到開工：接洽與評估、設計介面釐清、估價與簽約、開工準備 |
| `construction-2.workflow.json` | 工程承攬流程（二）施工到保固：施工執行、施工管理、驗收與交屋、保固與售後 |
| `../../public/flows/*.html` | 產出的圖（自含 HTML，APP 用 iframe 顯示） |

工程承攬流程拆成兩張，是因為 8 個階段放在一張圖上，桌機一屏放不下（Archify 的瀏覽器檢查會擋）。

重新產生（需要安裝 Archify skill）：

```bash
node docs/archify/construction.build.mjs
node <archify>/bin/archify.mjs finalize workflow docs/archify/construction-1.workflow.json public/flows/construction-1.html --quality standard --json
node <archify>/bin/archify.mjs finalize workflow docs/archify/construction-2.workflow.json public/flows/construction-2.html --quality standard --json
node <archify>/bin/archify.mjs finalize workflow docs/archify/pm-overview.workflow.json public/flows/pm-overview.html --quality showcase --json
```

產生後一定要再跑一次後處理（拿掉底框、縮放按鈕與「路徑」，加上雙指縮放、拖曳、雙擊放大）：

```bash
node docs/archify/viewer-patch.mjs public/flows/pm-overview.html public/flows/construction-1.html public/flows/construction-2.html
```

這支腳本可以重複執行，不會重複插入。

finalize 會在輸出旁邊寫檢查紀錄（`*.finalize-summary.json` 等）。建議在暫存資料夾執行，再把 HTML 複製進 `public/flows/`，避免把紀錄檔一起部署。

`meta.translations` 是繁體中文介面字串（由 Archify 內建的簡體中文經 OpenCC 轉成台灣用語，未經逐條人工校對）。
