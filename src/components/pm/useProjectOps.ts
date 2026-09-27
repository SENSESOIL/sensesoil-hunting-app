"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";
import useSWR from "swr";
import {
  buildViews,
  generateDemo,
  todayISO,
  type ProjectView,
} from "@/lib/project-ops";
import type { ProjectOpsResponse } from "@/app/api/project-ops/route";

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

export interface ProjectOps {
  loading: boolean;
  error?: string;
  errorStatus?: number;
  views: ProjectView[];
  today: string;
  source?: ProjectOpsResponse["source"];
  /** 工程資料試算表已連上 */
  connected: boolean;
  /** 試算表裡實際有填資料的專案數（示範模式時為 0） */
  realRecordCount: number;
  /** 試算表還沒有任何資料時才能開示範；有真資料就不混在一起 */
  demoAvailable: boolean;
  demo: boolean;
  setDemo: (on: boolean) => void;
  refresh: () => void;
  fetchedAt?: string;
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

  const views = useMemo(() => {
    if (!data) return [];
    if (demo) {
      const d = generateDemo(data.registry, today);
      return buildViews(data.registry, d.records, d.items, today);
    }
    return buildViews(data.registry, data.records, data.items, today);
  }, [data, demo, today]);

  const setDemo = useCallback((on: boolean) => writeDemo(on), []);
  const refresh = useCallback(() => {
    void mutate();
  }, [mutate]);

  const ops = data?.source.ops.state;
  return {
    loading: isLoading && !data,
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
  };
}
