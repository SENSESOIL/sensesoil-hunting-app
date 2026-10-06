/**
 * 流程圖的角色（flowRole）：admin／editor／user／viewer
 *
 * 來源是權限表（Google Sheet）。在「指揮中心」底下加一欄「流程」，就以那一欄為準；
 * 還沒加欄位時：任何一欄是 Admin 的人 → admin，其他在權限表上的人 → user（唯讀）。
 *
 * 前端（決定 iframe 收到的角色）與 /api/workflow-chart/save（決定能不能寫）共用這一份，
 * 真正的把關在伺服器端。
 */

export type FlowRole = "admin" | "editor" | "user" | "viewer";

export function flowRoleFromRoles(roles: Record<string, string | undefined>): FlowRole {
  const r = roles["流程"];
  if (r === "admin" || r === "editor" || r === "user" || r === "viewer") return r;
  if (Object.values(roles).some((v) => v === "admin")) return "admin";
  return "user";
}

/** 看不看得到「流程」分頁：權限表有「流程」欄而且這格空白 → 看不到；沒有這欄 → 能進指揮中心就看得到 */
export function canSeeFlows(roles: Record<string, string | undefined>): boolean {
  if (!("流程" in roles)) return true;
  if (Object.values(roles).some((v) => v === "admin")) return true;
  return roles["流程"] !== "none" && roles["流程"] !== undefined;
}
