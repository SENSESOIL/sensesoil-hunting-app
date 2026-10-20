/* ══════════════════════════════════════════════════════════
   新手教學的訊息通道（app ↔ 教學）
   - app 在關鍵動作時喊一聲：tourEmit("task-saved", …)、tourEmit("menu-open") …
     沒有在教學中時沒人聽，成本只有一個空迴圈
   - 教學要 app 換頁時也走這裡：tourEmit("goto", { nav, tab, project })
   ══════════════════════════════════════════════════════════ */

export interface TourEvent {
  type: string;
  data?: unknown;
}

const subs = new Set<(e: TourEvent) => void>();

export function tourEmit(type: string, data?: unknown) {
  for (const f of [...subs]) f({ type, data });
}

export function onTour(f: (e: TourEvent) => void): () => void {
  subs.add(f);
  return () => {
    subs.delete(f);
  };
}

/** 目前教學用的練習專案代碼（沒在教學中＝null）；任務首頁會把它固定顯示出來 */
export const tourState: { code: string | null; pendingView: string | null; pendingProject: string | null; pendingOpen: string | null } = {
  code: null,
  // 「帶我過去」時目標頁面可能還沒畫出來：先記著，頁面一出現就套用
  pendingView: null,
  pendingProject: null,
  pendingOpen: null,
};

/** 練習專案的代碼前綴（伺服器用 email 算出後面那段） */
export const TOUR_PREFIX = "DEMO-";
