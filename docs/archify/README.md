# Archify 流程總覽

指揮中心 → 營運 → 流程 FLOW 下方的「專案管理流程總覽」，由 [Archify](https://github.com/tt-a1i/archify) 產生。

| 檔案 | 說明 |
| --- | --- |
| `pm-overview.workflow.json` | Archify 的輸入（workflow 類型）：5 個階段 × 6 個關鍵步驟、決策關卡與退回路徑 |
| `pm-overview.build.mjs` | 產生上面 JSON 的腳本（步驟、部門、連線都在這裡改） |
| `../../public/flows/pm-overview.html` | 產出的圖（自含 HTML，APP 用 iframe 顯示） |

資料來源：流程圖網站內建的「專案管理流程」（47 個步驟），濃縮成總覽；完整、可編輯的版本仍在清單裡的「專案管理流程」。

重新產生（需要安裝 Archify skill）：

```bash
node <archify>/bin/archify.mjs finalize workflow docs/archify/pm-overview.workflow.json public/flows/pm-overview.html --quality showcase --json
```

`meta.translations` 是繁體中文介面字串（由 Archify 內建的簡體中文經 OpenCC 轉成台灣用語，未經逐條人工校對）。
