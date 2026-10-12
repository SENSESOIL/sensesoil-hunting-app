// 產生 Archify workflow 候選檔：拾壤專案管理流程（資料取自流程圖網站內建的 PM_FLOW）
import fs from "fs";

// 繁中介面字串沿用目前 JSON 裡的（OpenCC 由簡轉繁，未逐條人工校對）
const zhTW = JSON.parse(fs.readFileSync(new URL("./pm-overview.workflow.json", import.meta.url), "utf8")).meta.translations;

const N = (id, lane, col, type, label, sublabel, tag) => ({ id, lane, col, type, label, sublabel, ...(tag ? { tag } : {}), width: 150 });

const nodes = [
  // 1 需求接洽
  N("lead", "s1", 0, "backend", "需求蒐集", "集客課"),
  N("talk", "s1", 1, "external", "初次洽談", "銷售課"),
  N("survey", "s1", 2, "external", "現勘", "規劃課"),
  N("take", "s1", 3, "security", "接案評估", "主管議會", "接案／婉拒"),
  N("open", "s1", 4, "backend", "專案開案", "規劃課"),
  N("account", "s1", 5, "database", "建立專案帳戶", "收入課", "→ 規劃設計"),
  // 2 規劃設計與報價
  N("measure", "s2", 0, "external", "丈量", "規劃課"),
  N("design", "s2", 1, "backend", "配置與渲染", "設計課"),
  N("quote", "s2", 2, "backend", "介面檢討與報價", "規劃課"),
  N("pitch", "s2", 3, "security", "提案與議價", "銷售課", "確認／修改"),
  N("sign", "s2", 4, "external", "合約審閱與簽約", "風控課、收入課"),
  N("deposit", "s2", 5, "database", "訂金請款", "收入課", "→ 工程施工"),
  // 3 工程施工
  N("drawing", "s3", 0, "backend", "施工圖與請照", "設計課"),
  N("bid", "s3", 1, "backend", "排程與發包", "規劃課"),
  N("spend", "s3", 2, "security", "支出審核", "支出課", "核准／退回"),
  N("build", "s3", 3, "backend", "開工與施工監造", "工程課"),
  N("inspect", "s3", 4, "security", "階段查驗", "品質管理課", "合格／改善"),
  N("progress", "s3", 5, "database", "期款與廠商付款", "收入課、支出課", "→ 驗收"),
  // 4 驗收與完工
  N("selfcheck", "s4", 0, "backend", "完工自主檢查", "工程課"),
  N("accept", "s4", 1, "security", "品質驗收", "品質管理課", "通過／缺失"),
  N("handover", "s4", 2, "external", "業主驗收交屋", "銷售課"),
  N("final", "s4", 3, "database", "尾款請款", "收入課"),
  N("close", "s4", 4, "database", "結案帳務與檢討", "會計課、主管議會"),
  N("archive", "s4", 5, "backend", "績效考核與歸檔", "績效課、支援課", "結案"),
  // 5 保固與售後服務
  N("manual", "s5", 0, "external", "交付維護手冊", "客戶關係課", "交屋後"),
  N("care", "s5", 1, "external", "售後關懷", "客戶關係課"),
  N("repair", "s5", 2, "security", "報修受理", "客戶關係課", "保固內／外"),
  N("fix", "s5", 3, "external", "維修派工", "工程課"),
  N("satisfy", "s5", 4, "external", "滿意調查", "客戶關係課"),
  N("referral", "s5", 5, "backend", "見證與引薦", "公共關係課"),
];

const E = (from, to, o = {}) => ({ id: `${from}-${to}`, from, to, ...o });
const edges = [
  E("lead", "talk"), E("talk", "survey"), E("survey", "take"),
  E("take", "open", { label: "接案", variant: "emphasis" }), E("open", "account"),
  E("measure", "design"), E("design", "quote"), E("quote", "pitch"),
  E("pitch", "sign", { label: "確認", variant: "emphasis" }),
  E("pitch", "design", { label: "修改", role: "return", variant: "dashed" }),
  E("sign", "deposit"),
  E("drawing", "bid"), E("bid", "spend"),
  E("spend", "build", { label: "核准", variant: "emphasis" }),
  E("spend", "bid", { label: "退回", role: "return", variant: "dashed" }),
  E("build", "inspect"),
  E("inspect", "progress", { label: "合格", variant: "emphasis" }),
  E("inspect", "build", { label: "改善", role: "return", variant: "dashed" }),
  E("selfcheck", "accept"),
  E("accept", "handover", { label: "通過", variant: "emphasis" }),
  E("accept", "selfcheck", { label: "缺失改善", role: "return", variant: "dashed" }),
  E("handover", "final", { role: "branch" }), E("final", "close"), E("close", "archive"),
  E("manual", "care"), E("care", "repair", { label: "有報修" }),
  E("repair", "fix", { label: "保固外先報價" }),
  E("fix", "satisfy"), E("satisfy", "referral"),
];

const candidate = {
  schema_version: 2,
  diagram_type: "workflow",
  meta: {
    title: "專案管理流程",
    locale: "zh-TW",
    translations: zhTW,
    quality_profile: "showcase",
    output: "public/flows/pm-overview.html",
    legend: {
      mode: "auto",
      entries: {
        backend: { label: "內部作業" },
        external: { label: "業主參與" },
        security: { label: "決策關卡" },
        database: { label: "帳務請款" },
      },
    },
  },
  lanes: [
    { id: "s1", label: "需求接洽" },
    { id: "s2", label: "規劃設計與報價" },
    { id: "s3", label: "工程施工" },
    { id: "s4", label: "驗收與完工" },
    { id: "s5", label: "保固與售後" },
  ],
  mainPath: ["lead", "talk", "survey", "take", "open", "account"],
  nodes,
  edges,
  cards: [
    { dot: "rose", title: "決策關卡", items: ["接案評估：婉拒時保留名單，轉客戶經營", "提案議價、支出審核、查驗、驗收：不通過就回到上一步改善"] },
    { dot: "cyan", title: "收款節點", items: ["簽約收訂金、施工依合約收期款、交屋收尾款", "廠商款每月 10 號統一匯款"] },
    { dot: "amber", title: "循環", items: ["見證與引薦的名單，回到需求蒐集", "完整 47 個步驟與負責人見「專案管理流程」流程圖"] },
  ],
};

fs.writeFileSync(new URL("./pm-overview.workflow.json", import.meta.url), JSON.stringify(candidate, null, 2));
console.log("nodes", nodes.length, "edges", edges.length);
