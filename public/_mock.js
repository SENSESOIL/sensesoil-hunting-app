// 測試用（測完刪掉）：攔下 /api/pm，換成假資料
export async function setup() {
  localStorage.setItem("pm:tour:invited", "1");
  localStorage.removeItem("pm:tour:active");
  window.__posts = [];
  const of = window.__of || window.fetch;
  window.__of = of;
  const base = await of("/api/pm").then((r) => r.json());
  const me = "sensesoil.tw@gmail.com";
  const T = (id, title, o = {}) => ({ id, code: "B20", title, kind: "施工", status: "todo", progress: 0, flagged: false, seq: 0, version: 1, createdBy: me, createdAt: "2026-10-01T02:00:00Z", ...o });
  let data = {
    ...base,
    configured: true,
    goalsReady: true,
    goals: [{ id: "g1", title: "2026教育訓練", start: "2026-03-01", due: "2026-12-31", ownerEmail: "atw007wj@gmail.com", color: "#F39C12", version: 1 }],
    projects: base.projects.map((p) => (p.code === "B20" ? { ...p, name: "老佛爺泥牆", hasRow: true, stage: "施工中" } : p)),
    tasks: [T("t1", "Test", { due: "2026-10-20", assigneeEmail: me }), T("t2", "謝謝", { due: "2026-10-21", assigneeEmail: "atw007wj@gmail.com", goalId: "g1" })],
  };
  window.__data = () => data;
  const J = (x) => new Response(JSON.stringify(x), { headers: { "content-type": "application/json" } });
  window.fetch = async (u, o = {}) => {
    const url = String(u);
    if ((url.endsWith("/api/pm") || url.includes("/api/pm?")) && (!o.method || o.method === "GET")) return J(data);
    if (url.endsWith("/api/pm") && o.method === "POST") {
      const b = JSON.parse(o.body);
      window.__posts.push(b.op);
      if (b.op === "tutorial.start") {
        data = { ...data, projects: [...data.projects.filter((p) => p.code !== "DEMO-TEST"), { code: "DEMO-TEST", name: "新手練習（拾壤）", company: "新手教學", inCrm: false, hasRow: true, stage: "施工中", startAt: "2026-10-20", dueAt: "2026-11-03", editors: [me], archived: false, version: 1, photoCount: 0, sections: [] }] };
        return J({ status: "ok", code: "DEMO-TEST" });
      }
      if (b.op === "tutorial.end") {
        data = { ...data, tasks: data.tasks.filter((t) => t.code !== "DEMO-TEST"), projects: data.projects.map((p) => (p.code === "DEMO-TEST" ? { ...p, archived: true } : p)) };
        return J({ status: "ok", purged: true });
      }
      if (b.op === "task.save") {
        const prev = data.tasks.find((t) => t.id === b.task.id);
        const t = { kind: "施工", status: "todo", progress: 0, flagged: false, seq: data.tasks.length, createdBy: me, createdAt: new Date().toISOString(), ...(prev || {}), ...Object.fromEntries(Object.entries(b.task).filter(([, v]) => v !== null)), version: (prev?.version || 0) + 1 };
        data = { ...data, tasks: prev ? data.tasks.map((x) => (x.id === t.id ? t : x)) : [...data.tasks, t] };
        return J({ status: "ok", task: t });
      }
      return J({ status: "ok" });
    }
    return of(u, o);
  };
  Object.defineProperty(document, "visibilityState", { get: () => "visible", configurable: true });
  window.dispatchEvent(new Event("focus"));
  document.dispatchEvent(new Event("visibilitychange"));
  window.__card = () => document.querySelector('[aria-label^="新手教學："]')?.getAttribute("aria-label").replace("新手教學：", "") ?? null;
  window.__hole = () => !!document.querySelector(".tour-ring");
  window.W = (ms) => new Promise((r) => setTimeout(r, ms));
  window.vis = (sel) => [...document.querySelectorAll(sel)].find((e) => e.getBoundingClientRect().width > 0);
  window.btn = (txt) => [...document.querySelectorAll("button")].find((b) => b.innerText.trim() === txt);
  await window.W(1200);
}
