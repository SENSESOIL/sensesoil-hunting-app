/* ══════════════════════════════════════════════════════════
   任務標籤（存在 pm_tasks.meta）
   - 分類：工種（單選）、工項（多選）
   - 狀態：工法、工審、工責、報價、合約、定位、工料、廠商請款（單選）
   - 工期：進場日＝任務的開始日；預計天數 → 自動算期限
   - 自訂標籤
   清單上只顯示「分類」和「還沒處理」的狀態（tone = warn），已完成確認的不顯示，畫面才乾淨。
   要增減選項只改這個檔案。
   ══════════════════════════════════════════════════════════ */

import { tradeColor } from "./model";

export interface TaskMeta {
  /** 工種 */
  trade?: string;
  /** 工項 */
  areas?: string[];
  /** 工法是否確認 */
  method?: string;
  /** 工法備註 */
  methodNote?: string;
  /** 工審：業主／設計師確認可施作 */
  review?: string;
  /** 工責：誰做 */
  duty?: string;
  /** 報價 */
  quote?: string;
  /** 合約 */
  contract?: string;
  /** 定位：是否需要放樣 */
  layout?: string;
  /** 工料：是否備好 */
  material?: string;
  /** 工期：廠商預計完工天數 */
  days?: number;
  /** 工期：廠商請款 */
  bill?: string;
  /** 自訂標籤 */
  tags?: string[];
  /** 清單分組（專案 sections 裡的 id） */
  section?: string;
}

export const TRADES = ["打除", "水電", "泥作", "防水", "木作", "系統櫃", "油漆", "鐵件", "玻璃", "空調", "地板", "石材", "燈具", "衛浴", "清潔", "景觀", "其他"];
export const AREAS = ["天", "地", "壁", "燈", "設備", "櫃", "衛浴", "傢俱", "景觀"];

export type Tone = "warn" | "ok" | "muted";
export interface StatusOption {
  value: string;
  label: string;
  /** 清單上的短標籤；沒有就不顯示（例如「已確認」這類完成狀態） */
  chip?: string;
  tone: Tone;
}
export interface StatusField {
  key: "method" | "review" | "duty" | "quote" | "contract" | "layout" | "material" | "bill";
  label: string;
  group: "確認" | "商務" | "現場" | "工期";
  options: StatusOption[];
}

export const STATUS_FIELDS: StatusField[] = [
  {
    key: "method",
    label: "工法",
    group: "確認",
    options: [
      { value: "todo", label: "待確認", chip: "工法待確認", tone: "warn" },
      { value: "ok", label: "已確認", tone: "ok" },
    ],
  },
  {
    key: "review",
    label: "工審",
    group: "確認",
    options: [
      { value: "todo", label: "待確認", chip: "工審待確認", tone: "warn" },
      { value: "owner", label: "業主確認", tone: "ok" },
      { value: "designer", label: "設計師確認", tone: "ok" },
      { value: "both", label: "都已確認", tone: "ok" },
      { value: "no", label: "不可施作", chip: "不可施作", tone: "warn" },
    ],
  },
  {
    key: "duty",
    label: "工責",
    group: "確認",
    options: [
      { value: "self", label: "自有工班", chip: "自有", tone: "muted" },
      { value: "sub", label: "委外發包", chip: "委外", tone: "muted" },
      { value: "owner", label: "業主自行發包", chip: "業主自包", tone: "muted" },
    ],
  },
  {
    key: "quote",
    label: "報價",
    group: "商務",
    options: [
      { value: "todo", label: "未報價", chip: "未報價", tone: "warn" },
      { value: "sent", label: "已報價", chip: "報價待回覆", tone: "warn" },
      { value: "ok", label: "已確認", tone: "ok" },
    ],
  },
  {
    key: "contract",
    label: "合約",
    group: "商務",
    options: [
      { value: "todo", label: "未簽", chip: "合約未簽", tone: "warn" },
      { value: "signed", label: "已簽", tone: "ok" },
      { value: "change", label: "追加減", chip: "追加減", tone: "warn" },
    ],
  },
  {
    key: "layout",
    label: "定位",
    group: "現場",
    options: [
      { value: "na", label: "不需放樣", tone: "ok" },
      { value: "todo", label: "待放樣", chip: "待放樣", tone: "warn" },
      { value: "done", label: "已放樣", tone: "ok" },
    ],
  },
  {
    key: "material",
    label: "工料",
    group: "現場",
    options: [
      { value: "todo", label: "未備料", chip: "未備料", tone: "warn" },
      { value: "deposit", label: "已下訂", chip: "待到料", tone: "warn" },
      { value: "ready", label: "已到料", tone: "ok" },
    ],
  },
  {
    key: "bill",
    label: "廠商請款",
    group: "工期",
    options: [
      { value: "todo", label: "未請款", tone: "muted" },
      { value: "billed", label: "已請款", chip: "廠商已請款", tone: "warn" },
      { value: "paid", label: "已付款", tone: "ok" },
    ],
  },
];

export const WARN = "#C2410C";

export interface MetaChip {
  text: string;
  color: string;
  bg: string;
}

/** 清單上的精簡標籤：工種、工項、自訂，以及還沒處理的狀態 */
export function metaChips(meta?: TaskMeta): MetaChip[] {
  if (!meta) return [];
  const out: MetaChip[] = [];
  if (meta.trade) {
    const c = tradeColor(meta.trade);
    out.push({ text: meta.trade, color: c, bg: `color-mix(in srgb, ${c} 12%, transparent)` });
  }
  for (const a of meta.areas ?? []) out.push({ text: a, color: "#52525B", bg: "#F2F2F4" });
  for (const f of STATUS_FIELDS) {
    const v = meta[f.key];
    const opt = f.options.find((o) => o.value === v);
    if (!opt?.chip) continue;
    out.push(
      opt.tone === "warn"
        ? { text: opt.chip, color: WARN, bg: "#FFF1E6" }
        : { text: opt.chip, color: "#52525B", bg: "#F2F2F4" }
    );
  }
  for (const t of meta.tags ?? []) out.push({ text: `#${t}`, color: "#2F7FD8", bg: "#EAF2FC" });
  return out;
}

/** 首頁「標籤」區：任務裡用過的工種、工項、自訂標籤 */
export function tagKeys(meta?: TaskMeta): string[] {
  if (!meta) return [];
  return [...(meta.trade ? [meta.trade] : []), ...(meta.areas ?? []), ...(meta.tags ?? []).map((t) => `#${t}`)];
}

/** 從前端或資料庫讀進來的 meta：只留認得的欄位，型別不對就丟掉 */
export function cleanMeta(raw: unknown): TaskMeta {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const r = raw as Record<string, unknown>;
  const str = (v: unknown, max = 40) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : undefined);
  const list = (v: unknown) => (Array.isArray(v) ? [...new Set(v.map((x) => str(x, 20)).filter(Boolean) as string[])].slice(0, 20) : undefined);
  const out: TaskMeta = {};
  const trade = str(r.trade, 20);
  if (trade) out.trade = trade;
  const areas = list(r.areas);
  if (areas?.length) out.areas = areas;
  for (const f of STATUS_FIELDS) {
    const v = str(r[f.key], 20);
    if (v && f.options.some((o) => o.value === v)) out[f.key] = v;
  }
  const note = str(r.methodNote, 500);
  if (note) out.methodNote = note;
  if (typeof r.days === "number" && Number.isFinite(r.days) && r.days > 0 && r.days <= 999) out.days = Math.round(r.days);
  const tags = list(r.tags);
  if (tags?.length) out.tags = tags;
  const section = str(r.section, 40);
  if (section) out.section = section;
  return out;
}
