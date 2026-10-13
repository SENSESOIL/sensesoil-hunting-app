# Archify 流程圖

指揮中心 → 營運 → 流程 FLOW 清單裡，排在可編輯的「專案管理流程」下面的兩張唯讀圖，都由 [Archify](https://github.com/tt-a1i/archify) 產生。
清單在 `src/components/WorkflowCharts.tsx` 的 `STATIC_FLOWS`。點開後滿版顯示。

| 檔案 | 說明 |
| --- | --- |
| `pm-overview.workflow.json` | 專案管理流程總覽（有設計）：5 個階段 × 6 個關鍵步驟、決策關卡與退回路徑 |
| `pm-overview.build.mjs` | 產生上面 JSON 的腳本 |
| `construction.build.mjs` | 工程承攬流程（沒有設計，拾壤是工程管理單位，泥作／土作由自有工班施作）。7 個階段、54 個步驟；釐清設計用「八工檢核法」，施工中用「監造八管」；附 12 張說明卡。超過 6 步的階段用上下兩排（yOffset） |
| `construction.workflow.json` | 上面腳本產生的 Archify 輸入 |
| `step-details.json` | 步驟的詳細說明（監造管理的「監造八管」、八工的每一工），依檔名與步驟 id 對應；收合狀態下點步驟的「詳細」顯示。改完重跑 `viewer-patch.mjs` 即可，不用重新產生圖 |
| `viewer-patch.mjs` | 後處理：底框、手勢縮放、「收合／資訊」按鈕、透鏡單選、步驟詳細說明 |
| `../../public/flows/*.html` | 產出的圖（自含 HTML，APP 用 iframe 顯示） |

工程承攬流程 7 個階段放在同一張圖。整頁太高、過不了 Archify 的瀏覽器檢查，所以用 `deliver`（不跑 finalize）產生，版面靠後處理的縮放手勢與「收合」按鈕。

重新產生（需要安裝 Archify skill）：

```bash
node docs/archify/construction.build.mjs
node <archify>/bin/archify.mjs deliver workflow docs/archify/construction.workflow.json public/flows/construction.html --quality standard --json
node <archify>/bin/archify.mjs finalize workflow docs/archify/pm-overview.workflow.json public/flows/pm-overview.html --quality showcase --json
```

產生後一定要再跑一次後處理（拿掉底框、縮放按鈕與「路徑」，加上雙指縮放、拖曳、雙擊放大、「資訊」與「收合」按鈕）：

```bash
node docs/archify/viewer-patch.mjs public/flows/pm-overview.html public/flows/construction.html
```

這支腳本可以重複執行，不會重複插入。

finalize 會在輸出旁邊寫檢查紀錄（`*.finalize-summary.json` 等）。建議在暫存資料夾執行，再把 HTML 複製進 `public/flows/`，避免把紀錄檔一起部署。

`meta.translations` 是繁體中文介面字串（由 Archify 內建的簡體中文經 OpenCC 轉成台灣用語，未經逐條人工校對）。
