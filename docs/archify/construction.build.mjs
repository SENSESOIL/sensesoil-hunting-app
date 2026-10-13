// 產生 Archify workflow 候選檔：拾壤「工程承攬流程」
// 角色：不做設計。業主（與其設計師）提供設計，拾壤擔任工程管理單位——
//   協助釐清設計介面問題、把工程落實；泥作、土作由自有工班施作，其他工種發包協力廠商。
// 用法：node docs/archify/construction.build.mjs  →  docs/archify/construction-1.workflow.json、construction-2.workflow.json
import fs from "fs";

// 繁中介面字串沿用總覽那份（OpenCC 由簡轉繁，未逐條人工校對）
const zhTW = JSON.parse(fs.readFileSync(new URL("./pm-overview.workflow.json", import.meta.url), "utf8")).meta.translations;

const N = (id, lane, col, type, label, sublabel, tag) => ({ id, lane, col, type, label, sublabel, ...(tag ? { tag } : {}), width: 150 });

const nodes = [
  // 1 接洽與評估
  N("lead", "s1", 0, "backend", "詢案受理", "銷售課", "業主或設計師轉介"),
  N("docs", "s1", 1, "external", "圖說與需求盤點", "規劃課", "圖面常不齊"),
  N("site", "s1", 2, "external", "現勘與既有條件", "規劃課、工程課", "管委會規範"),
  N("take", "s1", 3, "security", "承接評估", "主管議會", "承接／婉拒"),
  N("pm", "s1", 4, "backend", "指派專案經理", "策略管理課", "單一窗口"),
  N("account", "s1", 5, "database", "建立專案帳戶", "收入課", "→ 介面釐清"),

  // 2 設計介面釐清
  N("review", "s2", 0, "backend", "設計圖說審查", "規劃課", "尺寸與法規"),
  N("interface", "s2", 1, "backend", "工序介面檢討", "規劃課、工程課", "收邊與管線衝突"),
  N("craft", "s2", 2, "backend", "泥作土作可行性", "泥作課、土造課", "厚度與養護期"),
  N("issues", "s2", 3, "backend", "疑義清單", "規劃課", "附照片與標註"),
  N("clarify", "s2", 4, "security", "澄清會議", "業主、設計師", "確認／補圖"),
  N("shop", "s2", 5, "backend", "介面整合圖", "設計課", "→ 估價"),

  // 3 估價與簽約
  N("qty", "s3", 0, "backend", "數量計算", "規劃課", "依整合圖"),
  N("subquote", "s3", 1, "database", "分包詢價", "支出課", "至少兩家比價"),
  N("selfcost", "s3", 2, "backend", "自有工班工料分析", "泥作課、土造課", "工時與耗損"),
  N("scope", "s3", 3, "backend", "報價與範圍界定", "規劃課", "含／不含／甲供"),
  N("nego", "s3", 4, "security", "議價確認", "銷售課", "確認／調整"),
  N("contract", "s3", 5, "external", "合約審閱與簽約", "風控課、收入課", "→ 開工準備"),

  // 4 開工準備
  N("deposit", "s4", 0, "database", "訂金請款", "收入課", "到帳才排程"),
  N("plan", "s4", 1, "backend", "施工計畫與排程", "工程課", "自有工班檔期"),
  N("permit", "s4", 2, "backend", "申請與保險", "工程課", "裝修審查、管委會"),
  N("submittal", "s4", 3, "security", "材料送審", "業主、設計師", "核可／更換"),
  N("procure", "s4", 4, "backend", "發包與叫料", "規劃課", "交期回推"),
  N("spend", "s4", 5, "security", "支出審核", "支出課", "核准／退回"),

  // 5 施工執行
  N("protect", "s5", 0, "external", "保護與放樣", "工程課", "放樣現場會勘"),
  N("mep", "s5", 1, "backend", "拆除與水電配管", "工程課、協力", "隱蔽工程"),
  N("hidden", "s5", 2, "security", "隱蔽查驗", "品質管理課", "合格／改善"),
  N("masonry", "s5", 3, "backend", "自有泥作", "泥作課", "防水試水 48 小時"),
  N("earth", "s5", 4, "backend", "自有土作", "土造課", "樣板與養護"),
  N("subwork", "s5", 5, "backend", "分包工程", "工程課", "木作、油漆、系統櫃"),

  // 6 施工管理
  N("daily", "s6", 0, "backend", "每日監造與日誌", "工程課", "工安與品質"),
  N("weekly", "s6", 1, "external", "週報與協調會", "工程課", "業主、設計師"),
  N("change", "s6", 2, "external", "變更需求", "銷售課", "設計或現況"),
  N("changegate", "s6", 3, "security", "變更評估", "規劃課、主管", "簽認／不變更"),
  N("progress", "s6", 4, "database", "期款請款", "收入課", "依合約節點"),
  N("payvendor", "s6", 5, "database", "廠商付款", "支出課", "每月 10 號"),

  // 7 驗收與交屋
  N("selfcheck", "s7", 0, "backend", "完工自主檢查", "工程課", "逐項對照報價"),
  N("qc", "s7", 1, "security", "品質驗收", "品質管理課", "通過／缺失"),
  N("joint", "s7", 2, "security", "聯合驗收", "業主、設計師", "通過／缺失"),
  N("handover", "s7", 3, "external", "交屋與竣工資料", "工程課、客戶關係課", "竣工圖、保固書"),
  N("final", "s7", 4, "database", "尾款請款", "收入課", "扣保留款"),
  N("close", "s7", 5, "backend", "結案檢討", "主管議會、會計課", "損益與績效"),

  // 8 保固與售後
  N("visit", "s8", 0, "external", "保固回訪", "客戶關係課", "交屋後 1、6、12 月"),
  N("repair", "s8", 1, "security", "報修受理", "客戶關係課", "保固外先報價"),
  N("fix", "s8", 2, "backend", "維修派工", "工程課、泥作課", "責任歸屬"),
  N("retention", "s8", 3, "database", "保留款請款", "收入課", "保固期滿"),
  N("satisfy", "s8", 4, "external", "滿意調查", "客戶關係課"),
  N("referral", "s8", 5, "backend", "見證與引薦", "公共關係課", "回到詢案"),
];

const E = (from, to, o = {}) => ({ id: `${from}-${to}`, from, to, ...o });
const back = (from, to, label) => E(from, to, { label, role: "return", variant: "dashed" });
const yes = (from, to, label) => E(from, to, { label, variant: "emphasis" });

const edges = [
  // 1
  E("lead", "docs"), E("docs", "site"), E("site", "take"), yes("take", "pm", "承接"), E("pm", "account"),
  // 2
  E("review", "interface"), E("interface", "craft"), E("craft", "issues"), E("issues", "clarify"),
  yes("clarify", "shop", "確認"), back("clarify", "review", "補圖"),
  // 3
  E("qty", "subquote"), E("subquote", "selfcost"), E("selfcost", "scope"), E("scope", "nego"),
  yes("nego", "contract", "確認"), back("nego", "scope", "調整"),
  // 4
  E("deposit", "plan"), E("plan", "permit"), E("permit", "submittal"),
  yes("submittal", "procure", "核可"), back("submittal", "plan", "更換重排"),
  E("procure", "spend"), back("spend", "procure", "退回"),
  // 5
  E("protect", "mep"), E("mep", "hidden"), yes("hidden", "masonry", "合格"), back("hidden", "mep", "改善"),
  E("masonry", "earth"), E("earth", "subwork"),
  // 6
  E("daily", "weekly"), E("weekly", "change"), E("change", "changegate"),
  yes("changegate", "progress", "簽認"), E("progress", "payvendor"),
  // 7
  E("selfcheck", "qc"), yes("qc", "joint", "通過"), back("qc", "selfcheck", "缺失"),
  yes("joint", "handover", "通過"), back("joint", "selfcheck", "缺失改善"),
  E("handover", "final"), E("final", "close"),
  // 8
  E("visit", "repair"), E("repair", "fix"), E("fix", "retention"),
  E("retention", "satisfy"), E("satisfy", "referral"),
];

const cards = [
  { dot: "slate", title: "角色定位", items: [
    "設計由業主（與其設計師）負責，拾壤不做設計",
    "拾壤是工程管理單位：釐清設計介面問題、把工程落實到完工",
    "泥作、土作由自有工班施作；水電、木作、油漆、系統櫃等發包協力廠商",
  ] },
  { dot: "cyan", title: "1 接洽與評估：會遇到的問題", items: [
    "只有 3D 圖或平面配置，沒有施工圖：先列「缺圖清單」，報價註明依現有圖面，缺圖另計",
    "業主與設計師期望不一致（預算、工期、誰拍板）：第一次會議就確認決策人與溝通窗口",
    "現況與圖面不符（樑柱、管道間、地坪高程）：現勘拍照量測，列入疑義清單",
    "大樓管委會限制施工時段、電梯保護、保證金：現勘就向管委會索取裝修規範",
    "承接評估看：自有泥作／土作檔期、毛利、付款條件、業主是否配合釐清介面",
  ] },
  { dot: "violet", title: "2 設計介面釐清：會遇到的問題", items: [
    "設計圖尺寸互相矛盾、未依法規（防火、無障礙、逃生）：審查後標註，請設計師修正",
    "工種介面衝突：管線與木作衝突、磁磚分割與門檻收邊、地坪洩水坡度、冷氣排水路徑",
    "泥作與土作的厚度、重量與養護期，常被設計忽略：提前提出可行工法與替代方案",
    "疑義口頭確認沒有紀錄：疑義清單逐條編號、附照片，澄清會議紀錄由業主與設計師簽認",
    "補圖遲遲不來：在清單上寫回覆期限，逾期影響工期要寫進會議紀錄",
  ] },
  { dot: "amber", title: "3 估價與簽約：會遇到的問題", items: [
    "數量算錯或漏項：依介面整合圖計算，報價逐項對應圖號",
    "協力廠商報價差距大、規格不同：至少兩家比價，規格統一後再比",
    "自有泥作、土作低估工時與耗損：依過去專案的實際工時與耗損率估算",
    "範圍不清造成日後爭議：寫明含／不含、甲供材料、設計變更與追加計價方式",
    "合約重點：付款節點、保留款比例與期限、工期延誤責任（業主延遲提供圖面不算我方）、保固範圍",
  ] },
  { dot: "orange", title: "4 開工準備：會遇到的問題", items: [
    "訂金未到就開始排工：到帳才排程、才叫料",
    "自有工班檔期與其他案子重疊：排程時同時看全公司的泥作、土作檔期",
    "室內裝修審查與管委會申請時間比預期長：申請時間要算進總工期",
    "材料送審拖延、停產、交期長：送審附替代品，長交期材料（進口磁磚、設備）優先下單",
    "發包超出預算：支出審核把關，超預算退回重新詢價或與業主討論",
  ] },
  { dot: "emerald", title: "5 施工執行：會遇到的問題", items: [
    "保護工程不足造成公共區域損壞與賠償：開工前拍照存證公共區域現況",
    "放樣與設計不符：放樣後請業主、設計師到現場確認再施工",
    "隱蔽工程（水電、防水）封板後才發現問題：封板前查驗並拍照，合格才進下一工序",
    "泥作：防水層要試水 48 小時，磁磚空心、洩水不良是常見客訴",
    "土作：天候與養護時間影響工期，先做樣板讓業主確認質感與色澤",
    "分包工種交接：前一工種完成並經確認，才讓下一工種進場，避免互相推卸責任",
  ] },
  { dot: "slate", title: "6 施工管理：會遇到的問題", items: [
    "每日日誌與照片沒有歸檔：照片依專案、日期、工項命名上傳雲端",
    "業主和設計師直接交代工班，繞過專案經理：所有變更都回到專案經理與變更流程",
    "口頭變更沒有簽認，事後爭議追加款：先估價、簽追加減單，再施作",
    "期款請款被拖延：依合約節點與查驗紀錄請款，附照片與完成比例",
    "廠商付款與請款不同步：每月 10 號統一付款，付款前核對發包單與發票",
  ] },
  { dot: "rose", title: "7 驗收與交屋：會遇到的問題", items: [
    "業主驗收標準與合約不同：驗收依合約與送審核可的樣品，現場不臨時加標準",
    "缺失改善一再反覆：缺失清單逐條編號、拍照，改善後複驗簽回",
    "竣工資料不齊：竣工圖、保固書、維護手冊、材料清單、廠商聯絡表一起點交",
    "尾款與保留款：尾款扣除保留款，保留款到期日寫進專案帳戶提醒",
    "結案檢討：時程、成本、品質、客訴與介面問題，回寫到下一案的檢討清單",
  ] },
  { dot: "cyan", title: "8 保固與售後：會遇到的問題", items: [
    "報修責任不清（使用不當、設計問題、施工問題、甲供材料）：受理時先判斷責任與保固範圍",
    "泥作類報修最多（磁磚、防水、裂縫）：泥作課優先處理並記錄原因，回饋到施工標準",
    "保固期滿忘記請保留款：保固期滿前一個月提醒請款",
    "回訪時機：交屋後 1、6、12 個月，順便請業主評價與引薦",
  ] },
];

const legend = {
  mode: "auto",
  entries: {
    backend: { label: "內部作業" },
    external: { label: "業主參與" },
    security: { label: "決策關卡" },
    database: { label: "帳務請款" },
  },
};

const lanes = [
  { id: "s1", label: "接洽與評估" },
  { id: "s2", label: "設計介面釐清" },
  { id: "s3", label: "估價與簽約" },
  { id: "s4", label: "開工準備" },
  { id: "s5", label: "施工執行" },
  { id: "s6", label: "施工管理" },
  { id: "s7", label: "驗收與交屋" },
  { id: "s8", label: "保固與售後" },
];

// 8 個階段一張圖放不進桌機一屏（Archify 的 viewport 檢查會擋），拆成前後兩張，各 4 個階段。
const PARTS = [
  { file: "construction-1", title: "工程承攬流程（一）接洽到開工", lanes: ["s1", "s2", "s3", "s4"], cards: [1, 2, 3, 4] },
  { file: "construction-2", title: "工程承攬流程（二）施工到保固", lanes: ["s5", "s6", "s7", "s8"], cards: [5, 6, 7, 8], width: 140 },
];

for (const part of PARTS) {
  const laneSet = new Set(part.lanes);
  const partNodes = nodes.filter((n) => laneSet.has(n.lane)).map((n) => (part.width ? { ...n, width: part.width } : n));
  const ids = new Set(partNodes.map((n) => n.id));
  const candidate = {
    schema_version: 2,
    diagram_type: "workflow",
    meta: {
      title: part.title,
      locale: "zh-TW",
      translations: zhTW,
      quality_profile: "standard",
      output: `public/flows/${part.file}.html`,
      legend,
    },
    lanes: lanes.filter((l) => laneSet.has(l.id)),
    mainPath: partNodes.filter((n) => n.lane === part.lanes[0]).map((n) => n.id),
    nodes: partNodes,
    edges: edges.filter((e) => ids.has(e.from) && ids.has(e.to)),
    cards: part.cards.map((i) => cards[i]),
  };
  fs.writeFileSync(new URL(`./${part.file}.workflow.json`, import.meta.url), JSON.stringify(candidate, null, 2));
  console.log(part.file, "nodes", candidate.nodes.length, "edges", candidate.edges.length, "cards", candidate.cards.length);
}
