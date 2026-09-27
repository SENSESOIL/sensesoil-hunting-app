"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";
import useSWR from "swr";
import {
  buildViews,
  generateDemo,
  todayISO,
  type OpsRecord,
  type ProjectView,
  type WorkItem,
} from "@/lib/project-ops";
import type { ProjectOpsResponse, SaveRequest, SaveResponse } from "@/app/api/project-ops/route";
import {
  overlay,
  readSandbox,
  sandboxClear,
  sandboxCount,
  sandboxResetProject,
  sandboxSaveProject,
  subscribeSandbox,
  type SandboxBase,
  type SandboxDoc,
} from "./sandbox";

/* ── 示範模式：存在 localStorage，兩個頁面共用；跨分頁用自訂事件同步 ── */
const DEMO_KEY = "ss-pm-demo";
const DEMO_EVENT = "ss-pm-demo-change";

function readDemo(): boolean {
  try {
    return window.localStorage.getItem(DEMO_KEY) === "1";
  } catch {
    return false;
  }
}
function subscribeDemo(cb: () => void) {
  window.addEventListener(DEMO_EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(DEMO_EVENT, cb);
    window.removeEventListener("storage", cb);
  };
}
function writeDemo(on: boolean) {
  try {
    if (on) window.localStorage.setItem(DEMO_KEY, "1");
    else window.localStorage.removeItem(DEMO_KEY);
  } catch {
    /* 私密模式等情況寫不進去就算了，只影響「記住」這件事 */
  }
  window.dispatchEvent(new Event(DEMO_EVENT));
}

class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

const fetcher = async (url: string): Promise<ProjectOpsResponse> => {
  const r = await fetch(url, { cache: "no-store" });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new HttpError(r.status, body?.error || `讀取失敗（${r.status}）`);
  return body as ProjectOpsResponse;
};

const EMPTY_DOC: SandboxDoc = { v: 1, records: {}, items: {}, touched: {} };

/**
 * 編輯要存到哪裡：
 *   server  —— 雲端資料庫已設定（全公司同步）
 *   sandbox —— 還沒有雲端資料庫：存在這台裝置（示範底稿與真實名冊分開存）
 */
export type SaveMode = "server" | "sandbox";

export interface SaveResult {
  ok: boolean;
  error?: string;
  /** 別人已經先改過（雲端模式的版本衝突） */
  conflict?: boolean;
}

export interface ProjectOps {
  loading: boolean;
  error?: string;
  errorStatus?: number;
  /** 已經有資料（重新整理失敗時仍保留舊資料，不要整頁換成錯誤畫面） */
  hasData: boolean;
  /** 讀不到拾壤CRM 的專案名冊（和「工程資料未連接」是兩回事） */
  registryError: boolean;
  views: ProjectView[];
  today: string;
  source?: ProjectOpsResponse["source"];
  /** 工程資料來源已連上（試算表或雲端資料庫） */
  connected: boolean;
  /** 資料來源裡實際有填資料的專案數（不含本機試編、不含示範） */
  realRecordCount: number;
  /** 資料來源還沒有任何資料時才能開示範；有真資料就不混在一起 */
  demoAvailable: boolean;
  demo: boolean;
  setDemo: (on: boolean) => void;
  refresh: () => void;
  fetchedAt?: string;

  /* ── 編輯 ── */
  saveMode: SaveMode;
  /** 目前使用的本機試編命名空間 */
  sandboxBase: SandboxBase;
  /** 本機試編了幾個專案（目前命名空間） */
  sandboxProjects: number;
  /** 真實名冊上的本機試編（接上雲端後可上傳） */
  realDrafts: number;
  /** 某專案是否有本機試編紀錄 */
  isDrafted: (code: string) => boolean;
  saveRecord: (rec: OpsRecord) => Promise<SaveResult>;
  saveItems: (code: string, items: WorkItem[]) => Promise<SaveResult>;
  /**
   * 一次存專案欄位與工項（任一可為 undefined＝不動）。
   * 本機試編時是單一次寫入；第一次編輯某專案時會把另一半一併快照（見下方註解）。
   */
  saveProject: (code: string, rec: OpsRecord | undefined, items: WorkItem[] | undefined) => Promise<SaveResult>;
  /** 這個專案目前的欄位與工項（編輯器存檔前的原狀，給「復原」用） */
  snapshot: (code: string) => { rec?: OpsRecord; items: WorkItem[] };
  /** 丟掉某專案的本機試編 */
  resetProject: (code: string) => void;
  /** 丟掉目前命名空間的全部本機試編 */
  clearSandbox: () => void;
  /** 把真實名冊上的本機試編上傳到雲端（僅雲端模式） */
  uploadDrafts: () => Promise<SaveResult>;
}

async function post(body: SaveRequest): Promise<SaveResult> {
  try {
    const r = await fetch("/api/project-ops", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const j = (await r.json().catch(() => ({}))) as SaveResponse;
    if (r.ok && j.ok) return { ok: true };
    return { ok: false, error: j.error || `儲存失敗（${r.status}）`, conflict: r.status === 409 };
  } catch {
    return { ok: false, error: "連線失敗，請確認網路後再試" };
  }
}

export function useProjectOps(): ProjectOps {
  const { data, error, isLoading, mutate } = useSWR<ProjectOpsResponse>("/api/project-ops", fetcher, {
    revalidateOnFocus: false,
    dedupingInterval: 30_000,
  });
  const demoFlag = useSyncExternalStore(subscribeDemo, readDemo, () => false);

  // 「今天」以日為單位；跨午夜時下一次重新整理自然會更新
  const today = todayISO();

  const realRecordCount = data?.records.length ?? 0;
  const demoAvailable = !!data && realRecordCount === 0 && data.registry.length > 0;
  const demo = demoFlag && demoAvailable;
  const writable = !!data?.source.ops.writable;
  const saveMode: SaveMode = writable && !demo ? "server" : "sandbox";
  const sandboxBase: SandboxBase = demo ? "demo" : "real";

  const sandbox = useSyncExternalStore(
    subscribeSandbox,
    () => readSandbox(sandboxBase),
    () => EMPTY_DOC
  );
  const realSandbox = useSyncExternalStore(
    subscribeSandbox,
    () => readSandbox("real"),
    () => EMPTY_DOC
  );

  const views = useMemo(() => {
    if (!data) return [];
    if (demo) {
      const d = generateDemo(data.registry, today);
      const m = overlay(d.records, d.items, sandbox);
      return buildViews(data.registry, m.records, m.items, today);
    }
    if (saveMode === "sandbox") {
      const m = overlay(data.records, data.items, sandbox);
      return buildViews(data.registry, m.records, m.items, today);
    }
    return buildViews(data.registry, data.records, data.items, today);
  }, [data, demo, today, sandbox, saveMode]);

  const setDemo = useCallback((on: boolean) => writeDemo(on), []);
  const refresh = useCallback(() => {
    void mutate();
  }, [mutate]);

  const stripItems = (arr: WorkItem[]) =>
    arr.map(({ ...it }) => {
      delete (it as { status?: unknown }).status;
      return it as WorkItem;
    });

  const snapshot = useCallback(
    (code: string) => {
      const v = views.find((x) => x.code === code);
      return { rec: v?.ops, items: stripItems(v?.items ?? []) };
    },
    [views]
  );

  const saveProject = useCallback(
    async (code: string, rec: OpsRecord | undefined, items: WorkItem[] | undefined): Promise<SaveResult> => {
      const stampedRec = rec ? { ...rec, code, updatedAt: todayISO() } : undefined;
      // 工項依清單順序寫入 seq：手動排序才不會被「依開始日排序」蓋掉
      const orderedItems = items?.map((it, i) => ({ ...it, code, seq: i }));
      if (saveMode === "sandbox") {
        // 整筆快照（copy-on-write）：示範資料的日期每天都以「今天」重新推算。
        // 若只存改過的一半，隔天沒存的那一半會漂移，專案日期和工項就對不上了。
        const doc = readSandbox(sandboxBase);
        const snap = snapshot(code);
        const recToWrite = stampedRec ?? (doc.records[code] ? undefined : snap.rec);
        const itemsToWrite =
          orderedItems ?? (doc.items[code] ? undefined : snap.items.map((it, i) => ({ ...it, seq: it.seq ?? i })));
        return sandboxSaveProject(sandboxBase, code, recToWrite, itemsToWrite)
          ? { ok: true }
          : { ok: false, error: "這台裝置無法儲存（可能是私密瀏覽模式或空間不足）" };
      }
      if (stampedRec) {
        const current = data?.records.find((r) => r.code === code);
        const res = await post({ op: "saveRecord", record: stampedRec, expectedUpdatedAt: current?.serverUpdatedAt ?? null });
        if (!res.ok) return res;
      }
      if (orderedItems) {
        const res = await post({ op: "saveItems", code, items: orderedItems });
        if (!res.ok) return res;
      }
      await mutate();
      return { ok: true };
    },
    [saveMode, sandboxBase, snapshot, data, mutate]
  );

  const saveRecord = useCallback((rec: OpsRecord) => saveProject(rec.code, rec, undefined), [saveProject]);
  const saveItems = useCallback((code: string, items: WorkItem[]) => saveProject(code, undefined, items), [saveProject]);

  const resetProject = useCallback((code: string) => sandboxResetProject(sandboxBase, code), [sandboxBase]);
  const clearSandbox = useCallback(() => sandboxClear(sandboxBase), [sandboxBase]);
  const isDrafted = useCallback((code: string) => !!sandbox.touched[code], [sandbox]);

  const uploadDrafts = useCallback(async (): Promise<SaveResult> => {
    if (!writable) return { ok: false, error: "尚未連接雲端資料庫" };
    const doc = readSandbox("real");
    const res = await post({
      op: "import",
      records: Object.values(doc.records),
      items: doc.items,
    });
    if (res.ok) {
      sandboxClear("real");
      await mutate();
    }
    return res;
  }, [writable, mutate]);

  const ops = data?.source.ops.state;
  return {
    loading: isLoading && !data,
    hasData: !!data,
    registryError: data?.source.registry.state === "error",
    error: error ? (error as Error).message : undefined,
    errorStatus: error instanceof HttpError ? error.status : undefined,
    views,
    today,
    source: data?.source,
    connected: ops === "ok" || ops === "partial",
    realRecordCount,
    demoAvailable,
    demo,
    setDemo,
    refresh,
    fetchedAt: data?.fetchedAt,
    saveMode,
    sandboxBase,
    sandboxProjects: sandboxCount(sandbox),
    realDrafts: sandboxCount(realSandbox),
    isDrafted,
    saveRecord,
    saveItems,
    saveProject,
    snapshot,
    resetProject,
    clearSandbox,
    uploadDrafts,
  };
}
