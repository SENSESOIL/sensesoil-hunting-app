/* ══════════════════════════════════════════════════════════
   提醒事項截圖匯入：把多張截圖接成一份清單
   - 每張截圖先在瀏覽器裡辨識成「由上到下的列」（reminder-ocr.ts，Tesseract，免費）
   - 長清單要分好幾張截，相鄰兩張上下會有重複的幾列：
     找出「上一張的最後 k 列 ＝ 下一張的最前 k 列」中最大的 k，重疊的部分只留一份
   - 截圖順序：先試著用重疊自動排（從沒有人接在前面的那張開始一路接下去），
     接不起來就照拍攝時間（檔案時間）
   ══════════════════════════════════════════════════════════ */

export interface ShotItem {
  kind: "section" | "task";
  text: string;
  indent: 0 | 1;
  done?: boolean;
  flagged?: boolean;
  note?: string;
  dateText?: string;
  dateISO?: string;
  /** 被圖片上下緣切到一半 */
  cut?: boolean;
}

export interface Shot {
  listTitle?: string;
  items: ShotItem[];
}

/** 比對用：去掉空白、標點、符號，全形半形統一 */
export function normText(s: string): string {
  return s.normalize("NFKC").replace(/[\s\p{P}\p{S}]/gu, "").toLowerCase();
}

function lev(a: string, b: string): number {
  if (a === b) return 0;
  const m = a.length;
  const n = b.length;
  if (!m || !n) return m || n;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[n];
}

/** 最長的連續相同字數 */
export function lcsLen(a: string, b: string): number {
  let best = 0;
  let prev = new Array(b.length + 1).fill(0);
  for (let i = 1; i <= a.length; i++) {
    const cur = new Array(b.length + 1).fill(0);
    for (let j = 1; j <= b.length; j++) if (a[i - 1] === b[j - 1]) best = Math.max(best, (cur[j] = prev[j - 1] + 1));
    prev = cur;
  }
  return best;
}

/** 兩段文字像不像（容許辨識時差一兩個字）：編輯距離或最長連續相同字數，取比較寬鬆的 */
function similar(a: string, b: string): boolean {
  if (a === b) return true;
  const L = Math.max(a.length, b.length);
  if (L <= 3) return false;
  return 1 - lev(a, b) / L >= 0.8 || lcsLen(a, b) / L >= 0.7;
}

/** 兩列是不是同一列（OCR 有時把分組讀成任務、或反過來，所以種類不同也可以，只看字） */
function sameRow(x: ShotItem, y: ShotItem): boolean {
  return similar(normText(x.text), normText(y.text));
}

/**
 * 從清單裡找名稱最像的一個（專案名稱比對用）：
 * 先試完整包含；包含不到，再找「連續相同的字最多」的。同分就不選，留給使用者。
 */
export function bestMatch<T>(target: string, list: T[], names: (x: T) => string[]): T | undefined {
  const t = normText(target);
  if (!t) return undefined;
  const inc = list.filter((x) => names(x).some((n) => (n = normText(n)) && (n.includes(t) || t.includes(n))));
  if (inc.length === 1) return inc[0];
  const pool = inc.length ? inc : list;
  const score = pool.map((x) => Math.max(0, ...names(x).map((n) => lcsLen(t, normText(n)))));
  const top = Math.max(0, ...score);
  if (top < 2 || score.filter((v) => v === top).length !== 1) return undefined;
  return pool[score.indexOf(top)];
}

/** 去掉上下緣被切一半的列 */
function trimCut(items: ShotItem[]): ShotItem[] {
  let s = 0;
  let e = items.length;
  while (s < e && items[s].cut) s++;
  while (e > s && items[e - 1].cut) e--;
  return items.slice(s, e);
}

/** a 的尾巴和 b 的開頭重疊幾列（b 開頭若是 a 目前所在的分組標題，先略過，再比） */
function overlap(a: ShotItem[], b: ShotItem[]): { k: number; skip: number } {
  const curSection = [...a].reverse().find((x) => x.kind === "section");
  const skip = b[0]?.kind === "section" && curSection && sameRow(b[0], curSection) && !(a.length && sameRow(a[a.length - 1], b[0])) ? 1 : 0;
  const bb = b.slice(skip);
  for (let k = Math.min(a.length, bb.length); k >= 1; k--) {
    let m = 0;
    for (let i = 0; i < k; i++) if (sameRow(a[a.length - k + i], bb[i])) m++;
    // 重疊 3 列以上時，容許其中 1 列辨識得不一樣（錯字）（第一列或最後一列要對上）
    const edgesOk = sameRow(a[a.length - k], bb[0]) || sameRow(a[a.length - 1], bb[k - 1]);
    if (m === k || (k >= 3 && m >= k - 1 && edgesOk)) return { k, skip };
  }
  return { k: 0, skip: 0 };
}

export interface Merged {
  listTitle?: string;
  items: ShotItem[];
  /** 截圖的實際接合順序（傳入陣列的索引） */
  order: number[];
  /** 接不起來的接縫：order 裡第 i 張和第 i+1 張之間 */
  gaps: number[];
}

/**
 * 把多張截圖接起來。shots 依「拍攝時間」排好傳入；會先試著依重疊自動重排。
 */
export function mergeShots(shots: Shot[]): Merged {
  const lists = shots.map((s) => trimCut(s.items));
  const n = lists.length;
  const listTitle = shots.find((s) => s.listTitle)?.listTitle;
  if (!n) return { listTitle, items: [], order: [], gaps: [] };

  // 自動排順序：k[i][j] = i 後面接 j 的重疊列數
  const k = lists.map((a, i) => lists.map((b, j) => (i === j ? 0 : overlap(a, b).k)));
  let order = lists.map((_, i) => i);
  if (n > 1) {
    const starts = order.filter((j) => order.every((i) => k[i][j] === 0));
    for (const s of starts) {
      const chain = [s];
      const used = new Set(chain);
      while (chain.length < n) {
        const last = chain[chain.length - 1];
        const next = order.filter((j) => !used.has(j) && k[last][j] > 0).sort((x, y) => k[last][y] - k[last][x])[0];
        if (next === undefined) break;
        chain.push(next);
        used.add(next);
      }
      if (chain.length === n) {
        order = chain;
        break;
      }
    }
  }

  const items: ShotItem[] = [...lists[order[0]]];
  const gaps: number[] = [];
  for (let i = 1; i < n; i++) {
    const b = lists[order[i]];
    const { k: ov, skip } = overlap(items, b);
    if (!ov) gaps.push(i - 1);
    items.push(...b.slice(skip + ov));
  }
  return { listTitle, items, order, gaps };
}

/* ── 轉成要匯入的任務 ── */

export interface PlanRow {
  key: string;
  kind: "section" | "task";
  text: string;
  depth: 0 | 1;
  /** 所在分組名稱（"" = 沒有分組） */
  section: string;
  done: boolean;
  flagged: boolean;
  note?: string;
  due?: string;
  dateText?: string;
  /** 子任務的上層（PlanRow.key） */
  parentKey?: string;
}

export function buildPlan(items: ShotItem[]): PlanRow[] {
  const out: PlanRow[] = [];
  let section = "";
  let lastTop: PlanRow | undefined;
  items.forEach((it, i) => {
    const key = `r${i}`;
    if (it.kind === "section") {
      section = it.text;
      lastTop = undefined;
      out.push({ key, kind: "section", text: it.text, depth: 0, section, done: false, flagged: false });
      return;
    }
    // 子任務要接在同一組的上一個主任務下面；沒有就當主任務
    const child = it.indent === 1 && !!lastTop;
    const row: PlanRow = {
      key,
      kind: "task",
      text: it.text,
      depth: child ? 1 : 0,
      section,
      done: !!it.done,
      flagged: !!it.flagged,
      note: [it.note, it.dateText && !it.dateISO ? it.dateText : ""].filter(Boolean).join("\n") || undefined,
      due: it.dateISO,
      dateText: it.dateText,
      parentKey: child ? lastTop!.key : undefined,
    };
    if (!child) lastTop = row;
    out.push(row);
  });
  return out;
}
