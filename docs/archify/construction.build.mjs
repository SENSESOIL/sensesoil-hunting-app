// 產生 Archify workflow 候選檔：拾壤「工程承攬流程」
// 角色：不做設計。業主（與其設計師）提供設計，拾壤擔任工程管理單位——
//   用「八工檢核法」釐清設計介面問題、把工程落實；泥作、土作由自有工班施作，其他工種發包協力廠商。
// 施工中用「監造八管」做現場管理。
// 用法：node docs/archify/construction.build.mjs  →  docs/archify/construction.workflow.json
// 一條泳道最多 6 欄；超過 6 步的階段用上下兩排（yOffset）。
import fs from "fs";

// 繁中介面字串沿用總覽那份（OpenCC 由簡轉繁，未逐條人工校對）
const zhTW = JSON.parse(fs.readFileSync(new URL("./pm-overview.workflow.json", import.meta.url), "utf8")).meta.translations;

const ROW = 56; // 兩排時，上下排距離泳道中心的偏移
const N = (id, lane, col, type, label, sublabel, tag, row) => ({
  id, lane, col, type, label, sublabel,
  ...(tag ? { tag } : {}),
  ...(row ? { yOffset: row * ROW } : {}),
  width: 140,
});
const UP = -1;
const DOWN = 1;
// 三排（施工中管理）
const TOP = -2;
const MID = 0.001; // 非 0，才會被當成堆疊的一排
const BOTTOM = 2;

const nodes = [
  // 1 接洽評估
  N("lead", "s1", 0, "backend", "詢案受理", "銷售課", "業主或設計師轉介"),
  N("docs", "s1", 1, "external", "圖說與需求盤點", "規劃課", "缺圖先列清單"),
  N("site", "s1", 2, "external", "現勘丈量", "規劃課、工程課", "拍照量測"),
  N("take", "s1", 3, "security", "承接評估", "主管議會", "承接／婉拒"),
  N("pm", "s1", 4, "backend", "指派專案經理", "策略管理課", "單一窗口"),
  N("account", "s1", 5, "database", "建立專案帳戶", "收入課", "→ 釐清設計"),

  // 2 釐清設計：八工檢核（上排由左往右，下排由右往左，蛇形）
  N("g-limit", "s2", 0, "backend", "工限", "環境限制", "動線、管委會、裝修審查", UP),
  N("g-audit", "s2", 1, "backend", "工審", "圖面釋疑", "列疑義、書面釐清", UP),
  N("g-item", "s2", 2, "backend", "工項", "項目釐清", "設計圖翻成工程項目", UP),
  N("g-method", "s2", 3, "backend", "工法", "技術評估", "畫得出是否做得出", UP),
  N("g-duty", "s2", 4, "backend", "工責", "邊界釐清", "我們做／別人做", UP),
  N("g-seq", "s2", 5, "backend", "工序", "介面檢討", "異材質交接、機電衝突", UP),
  N("g-mat", "s2", 5, "backend", "工料", "資源盤點", "交期、工班、同等品", DOWN),
  N("g-time", "s2", 4, "backend", "工期", "時間排程", "進退場節點", DOWN),
  N("issues", "s2", 3, "backend", "疑義清單", "規劃課", "編號、附照片", DOWN),
  N("clarify", "s2", 2, "security", "澄清會議", "業主、設計師", "確認／補圖", DOWN),
  N("shop", "s2", 1, "backend", "介面整合圖", "設計課", "→ 估價簽約", DOWN),

  // 3 估價簽約
  N("qty", "s3", 0, "backend", "數量計算", "規劃課", "依工項清單"),
  N("subquote", "s3", 1, "database", "分包詢價", "支出課", "至少兩家比價"),
  N("selfcost", "s3", 2, "backend", "自有工班工料分析", "泥作課、土造課", "工時與耗損"),
  N("scope", "s3", 3, "backend", "報價與範圍界定", "規劃課", "依工責寫含／不含"),
  N("nego", "s3", 4, "security", "議價確認", "銷售課", "確認／調整"),
  N("contract", "s3", 5, "external", "合約審閱與簽約", "風控課、收入課", "→ 施工前準備"),

  // 4 施工前準備
  N("deposit", "s4", 0, "database", "訂金請款", "收入課", "到帳才排程"),
  N("insure", "s4", 1, "backend", "保險", "風控課", "工程綜合險、意外險"),
  N("permit", "s4", 2, "backend", "許可申請", "工程課", "裝修審查、管委會"),
  N("material", "s4", 3, "security", "材質確認", "業主、設計師", "核可／更換同等品"),
  N("procure", "s4", 4, "backend", "發包叫料", "規劃課", "依工期回推交期"),
  N("spend", "s4", 5, "security", "支出審核", "支出課", "核准／退回"),

  // 5 施工中管理：上排現場施作（滿 6 欄後接到中排的分包工程），下排監造與請款
  N("safety", "s5", 0, "backend", "安全防護", "工程課", "圍籬、防護網、警示標示", TOP),
  N("protect", "s5", 1, "external", "保護", "工程課", "公共區域拍照存證", TOP),
  N("layout", "s5", 2, "external", "放樣", "工程課", "業主、設計師現場確認", TOP),
  N("handoff", "s5", 3, "backend", "交接介面處理", "工程課", "工種交接、收邊順序", TOP),
  N("masonry", "s5", 4, "backend", "自有泥作", "泥作課", "防水試水 48 小時", TOP),
  N("earth", "s5", 5, "backend", "自有土作", "土造課", "樣板與養護", TOP),
  N("subwork", "s5", 5, "backend", "分包工程", "工程課", "水電、木作、油漆", MID),
  N("supervise", "s5", 0, "backend", "監造管理", "工程課、品質管理課", "監造八管", BOTTOM),
  N("meeting", "s5", 1, "external", "工務會議", "工程課", "每週，業主、設計師", BOTTOM),
  N("change", "s5", 2, "security", "變更設計", "規劃課、主管", "先估價簽認再施作", BOTTOM),
  N("bill", "s5", 3, "database", "業主請款", "收入課", "依合約節點", BOTTOM),
  N("payvendor", "s5", 4, "database", "廠商請款", "支出課", "每月 10 號", BOTTOM),

  // 6 施工後交付（上排由左往右，下排由右往左）
  N("selfcheck", "s6", 0, "backend", "自主檢核", "工程課", "逐項對照報價", UP),
  N("qc", "s6", 1, "security", "品質驗收", "品質管理課", "通過／缺失", UP),
  N("joint", "s6", 2, "security", "聯合驗收", "業主、設計師", "通過／缺失", UP),
  N("asbuilt", "s6", 3, "external", "竣工資料", "工程課、客戶關係課", "竣工圖、保固書、使用說明", UP),
  N("final", "s6", 4, "database", "尾款請款", "收入課", "扣保留款", UP),
  N("casebook", "s6", 5, "backend", "案例紀錄", "公共關係課", "完工照、施工前後對比", UP),
  N("review", "s6", 5, "backend", "結案覆盤", "主管議會、會計課", "損益、時程、客訴", DOWN),
  N("report", "s6", 4, "backend", "結案報告", "專案經理", "對內教育訓練", DOWN),

  // 7 保固售服
  N("visit", "s7", 0, "external", "保固回訪", "客戶關係課", "交屋後 1、6、12 月"),
  N("repair", "s7", 1, "security", "報修受理", "客戶關係課", "保固內／外"),
  N("fix", "s7", 2, "backend", "維修派工", "工程課、泥作課", "責任歸屬"),
  N("retention", "s7", 3, "database", "保留款請款", "收入課", "保固期滿"),
  N("satisfy", "s7", 4, "external", "滿意調查", "客戶關係課"),
  N("referral", "s7", 5, "backend", "見證與引薦", "公共關係課", "回到詢案"),
];

const E = (from, to, o = {}) => ({ id: `${from}-${to}`, from, to, ...o });
const back = (from, to, label) => E(from, to, { label, role: "return", variant: "dashed" });
const yes = (from, to, label) => E(from, to, { label, variant: "emphasis" });
const down = (from, to) => E(from, to, { fromSide: "bottom", toSide: "top" });

const edges = [
  // 1
  E("lead", "docs"), E("docs", "site"), E("site", "take"), yes("take", "pm", "承接"), E("pm", "account"),
  // 2 八工檢核（蛇形）
  E("g-limit", "g-audit"), E("g-audit", "g-item", { fromSide: "right", toSide: "left" }), E("g-item", "g-method"), E("g-method", "g-duty"), E("g-duty", "g-seq"),
  down("g-seq", "g-mat"),
  E("g-mat", "g-time", { fromSide: "left", toSide: "right" }), E("g-time", "issues", { fromSide: "left", toSide: "right" }), E("issues", "clarify", { fromSide: "left", toSide: "right" }),
  // 下排由右往左：確認直接往左；補圖從澄清會議上方回到工審下方
  E("clarify", "shop", { label: "確認", variant: "emphasis", fromSide: "left", toSide: "right" }),
  E("clarify", "g-audit", { label: "補圖", role: "return", variant: "dashed", fromSide: "top" }),
  // 3
  E("qty", "subquote"), E("subquote", "selfcost"), E("selfcost", "scope"), E("scope", "nego"),
  yes("nego", "contract", "確認"), back("nego", "scope", "調整"),
  // 4
  E("deposit", "insure"), E("insure", "permit"), E("permit", "material"),
  yes("material", "procure", "核可"), E("procure", "spend"), back("spend", "procure", "退回"),
  // 5 現場施作
  E("safety", "protect"), E("protect", "layout"), E("layout", "handoff"), E("handoff", "masonry"), E("masonry", "earth"),
  down("earth", "subwork"),
  // 5 監造與請款
  E("supervise", "meeting"), E("meeting", "change"),
  yes("change", "bill", "簽認"), E("bill", "payvendor"),
  // 6
  E("selfcheck", "qc"), yes("qc", "joint", "通過"), back("qc", "selfcheck", "缺失"),
  yes("joint", "asbuilt", "通過"), back("joint", "selfcheck", "缺失改善"),
  E("asbuilt", "final"), E("final", "casebook"), down("casebook", "review"),
  E("review", "report", { fromSide: "left", toSide: "right" }),
  // 7
  E("visit", "repair"), E("repair", "fix"), E("fix", "retention"),
  E("retention", "satisfy"), E("satisfy", "referral"),
];

const cards = [
  { dot: "slate", title: "角色定位", items: [
    "設計由業主（與其設計師）負責，拾壤不做設計",
    "拾壤是工程管理單位：用八工檢核釐清設計介面問題，再把工程落實到完工",
    "泥作、土作由自有工班施作；水電、木作、油漆、系統櫃等發包協力廠商",
  ] },
  { dot: "cyan", title: "八工檢核①　先看客觀條件與圖面盲區", items: [
    "工限（環境限制）：進退料動線與電梯尺寸、管委會施工時間與噪音規定、消防區劃與室內裝修審查。利於掌握隱性成本與工時折損：只能假日施工或要請吊車，報價前就算進去",
    "工審（圖面釋疑）：挑出圖面漏項、設計不合理、尺寸兜不攏、材料不適配，列成疑義清單。利於防禦性報價與免責：報價前書面釐清，不概括承受設計圖的錯誤",
  ] },
  { dot: "violet", title: "八工檢核②　拆解執行細節與責任歸屬", items: [
    "工項（項目釐清）：把設計圖翻成工程執行項目，例如天花板＝角材、矽酸鈣板、批土、油漆。利於精準發包與成本初估，是估價與排程的基石",
    "工法（技術評估）：結構支撐、特殊造型、材質銜接畫得出是否做得出。利於把五金補強、特殊打底等隱形成本提早反映在報價",
    "工責（邊界釐清）：保護工程、鷹架、廢棄物清運、粗細清歸誰，哪些我們做、哪些業主自包。利於消除灰色地帶，防堵收尾時的合約糾紛",
  ] },
  { dot: "amber", title: "八工檢核③　收斂介面、資源與時間", items: [
    "工序（介面檢討）：預演施工順序，抓出木作與泥作收邊、空調與天花板高度等衝突。利於在紙上解決衝突，避免重工與推諉",
    "工料（資源盤點）：特殊建材交期與庫存、技術工班人力；缺料缺工就評估同等品。利於避免工班等料、料到沒人做",
    "工期（時間排程）：綜合前七工，排出各工種進退場節點與總進度。利於承諾交期，也是控管進度與請款的基準",
  ] },
  { dot: "emerald", title: "監造八管　施工中每天要管的事", items: [
    "管安全：施工圍籬、防護網、警示標示與消防器材每日巡查，高處作業與電動工具檢查，收工斷電與門禁。利於避免職災、公安意外與停工",
    "管品質：依送審樣品查驗；水電、防水等隱蔽工程封板前拍照查驗，合格才進下一工序。利於缺失當下改，不留到驗收",
    "管進度：每天對照工期表，落後就調人力或工序。利於準時交付，也是請款依據",
    "管介面：前一工種完成確認、下一工種簽收才進場。利於避免互相推諉與重工",
    "管材料：進場驗收規格與數量、保管防潮防損、餘料回收。利於避免用錯料與浪費",
    "管變更：任何變更先估價、簽追加減單再施作。利於防止口頭變更變成無償施工",
    "管成本：發包與實際支出對照預算，超支就預警。利於守住毛利",
    "管紀錄：每日日誌、照片依專案／日期／工項歸檔，會議紀錄簽認。利於爭議有證據、結案能覆盤",
  ] },
  { dot: "cyan", title: "1 接洽評估：會遇到的問題", items: [
    "只有 3D 圖或平面配置，沒有施工圖：先列缺圖清單，報價註明依現有圖面，缺圖另計",
    "業主與設計師期望不一致（預算、工期、誰拍板）：第一次會議就確認決策人與溝通窗口",
    "承接評估看：自有泥作／土作檔期、毛利、付款條件、業主是否配合釐清介面",
  ] },
  { dot: "violet", title: "2 釐清設計：會遇到的問題", items: [
    "八工依序做：先工限、工審（不可控風險），再工項、工法、工責（做什麼、怎麼做、誰做），最後工序、工料、工期（先後與資源）",
    "疑義口頭確認沒有紀錄：疑義清單逐條編號、附照片，澄清會議紀錄由業主與設計師簽認",
    "補圖遲遲不來：清單上寫回覆期限，逾期影響工期要寫進會議紀錄",
  ] },
  { dot: "amber", title: "3 估價簽約：會遇到的問題", items: [
    "數量算錯或漏項：依工項清單計算，報價逐項對應圖號",
    "範圍不清：依工責寫明含／不含、甲供材料、變更與追加計價方式",
    "合約重點：付款節點、保留款比例與期限、工期延誤責任（業主延遲提供圖面不算我方）、保固範圍",
  ] },
  { dot: "orange", title: "4 施工前準備：會遇到的問題", items: [
    "訂金未到就排工：到帳才排程、才叫料",
    "保險漏保：工程綜合險、第三人責任險、工班意外險開工前確認生效",
    "裝修審查與管委會申請比預期久：申請時間算進工期",
    "材質送審拖延、停產、交期長：送審附同等品，長交期材料優先下單；超預算由支出審核退回重議",
  ] },
  { dot: "emerald", title: "5 施工中管理：會遇到的問題", items: [
    "安全防護與保護不足：開工前先架設圍籬、防護網與警示標示，公共區域拍照存證，每日巡查是否破損",
    "放樣與設計不符：放樣後請業主、設計師到場確認再施工",
    "業主或設計師直接交代工班：一律回到專案經理與變更流程，先簽追加減單再做",
    "請款被拖延：依合約節點與監造紀錄請款，附照片與完成比例；廠商款每月 10 號統一付",
  ] },
  { dot: "rose", title: "6 施工後交付：會遇到的問題", items: [
    "驗收標準與合約不同：依合約與送審核可的樣品驗收，現場不臨時加標準",
    "缺失改善反覆：缺失清單逐條編號、拍照，改善後複驗簽回",
    "竣工資料不齊：竣工圖說、保固書、使用說明書、材料清單、廠商聯絡表一起點交",
    "案例紀錄：完工照、施工前後對比、特殊工法整理成案例，供業務與作品集使用",
    "結案覆盤看時程、成本、品質、客訴與介面問題；結案報告由專案經理對內分享，回寫成下一案的檢核項目",
  ] },
  { dot: "slate", title: "7 保固售服：會遇到的問題", items: [
    "報修責任不清（使用不當、設計、施工、甲供材料）：受理時先判斷責任與保固範圍，保固外先報價",
    "泥作類報修最多（磁磚、防水、裂縫）：記錄原因，回饋到施工標準",
    "保固期滿忘記請保留款：期滿前一個月提醒請款",
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
  { id: "s1", label: "接洽評估" },
  { id: "s2", label: "釐清設計" },
  { id: "s3", label: "估價簽約" },
  { id: "s4", label: "施工前準備" },
  { id: "s5", label: "施工中管理" },
  { id: "s6", label: "施工後交付" },
  { id: "s7", label: "保固售服" },
];

// 7 個階段放在同一張圖。整頁太高、過不了 Archify 的瀏覽器檢查，所以用 deliver 產生、不跑 finalize；
// 版面靠 viewer-patch.mjs 的縮放手勢與「收合」按鈕處理。
const candidate = {
  schema_version: 2,
  diagram_type: "workflow",
  meta: {
    title: "工程承攬流程",
    locale: "zh-TW",
    translations: zhTW,
    quality_profile: "standard",
    output: "public/flows/construction.html",
    legend,
  },
  lanes,
  mainPath: nodes.filter((n) => n.lane === "s1").map((n) => n.id),
  nodes,
  edges,
  cards,
};

fs.writeFileSync(new URL("./construction.workflow.json", import.meta.url), JSON.stringify(candidate, null, 2));
console.log("nodes", nodes.length, "edges", edges.length, "cards", cards.length);
