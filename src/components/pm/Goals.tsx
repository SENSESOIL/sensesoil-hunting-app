"use client";

import React, { useEffect, useMemo, useState } from "react";
import { addDays, fmtDate } from "@/lib/project-ops";
import { GOAL_COLORS, STATUS_LABEL, type Goal, type Task } from "@/lib/pm/model";
import Gantt, { type GanttRow } from "./Gantt";
import { Sheet, toast } from "./Sheet";
import { DateField, FieldGroup, Row, TextField } from "./fields";
import { Icon } from "./ui";
import { Avatar, Empty, GREEN, Group, ORANGE, RED } from "./kit";
import { assigneeLabel, isLate, personLabel, type GoalItem, type Pm } from "./usePm";

/* ══════════════════════════════════════════════════════════
   公司目標（任務追蹤 →「目標」分頁）
   - 每個人都看得到；只有管理者能新增、修改、刪除
   - 目標＝一段期間＋負責人；任務在「所屬目標」連結到目標
   - 進度不用手填：連結任務的完成件數／總件數
   - 甘特圖：目標一條，打開「顯示任務」時底下列出各自的任務
   ══════════════════════════════════════════════════════════ */

export function GoalsPage({ pm, onOpenTask }: { pm: Pm; onOpenTask: (t: Task) => void }) {
  const [sheet, setSheet] = useState<{ id: string | null } | null>(null);
  const [showTasks, setShowTasks] = useState(true);
  const { goals, today } = pm;

  if (!pm.goalsReady) {
    return (
      <Group>
        <Empty
          icon="flag"
          title="公司目標還沒啟用"
          hint={
            pm.isManager
              ? "請到 Supabase → SQL Editor 執行 supabase/migrations/20261014000000_pm_goals.sql，執行一次就好。"
              : "管理者設定好之後，公司的目標會出現在這裡。"
          }
        />
      </Group>
    );
  }

  const linked = goals.reduce((n, g) => n + g.tasks.length, 0);

  return (
    <>
      <div className="flex items-end justify-between gap-3 pt-1">
        <div className="min-w-0">
          <h1 className="text-[28px] leading-[34px] font-bold tracking-tight text-[#18181B]">公司目標</h1>
          <p className="mt-1 text-[14px] text-[#71717A]">
            {goals.length ? `${goals.length} 個目標・${linked} 件任務連結中` : "把公司的大目標排出來，任務再連到目標"}
          </p>
        </div>
        {pm.isManager && (
          <button
            type="button"
            onClick={() => setSheet({ id: null })}
            aria-label="新增目標"
            className="w-12 h-12 rounded-full shrink-0 flex items-center justify-center text-white shadow-[0_6px_16px_rgba(243,156,18,0.35)] active:scale-95 transition-transform"
            style={{ background: ORANGE }}
          >
            <Icon name="add" weight={500} className="text-[26px]" />
          </button>
        )}
      </div>

      {!goals.length ? (
        <Group>
          <Empty
            icon="flag"
            title="還沒有公司目標"
            hint={pm.isManager ? "按「＋」新增第一個目標，例如「Q4 完成 3 案交屋」。新增任務時就能選「所屬目標」。" : "管理者設定好之後會出現在這裡。"}
          />
        </Group>
      ) : (
        <>
          <div className="grid gap-3 md:grid-cols-2">
            {goals.map((g) => (
              <GoalCard key={g.id} g={g} pm={pm} onClick={() => setSheet({ id: g.id })} />
            ))}
          </div>

          <div className="flex items-center justify-between gap-2 pt-2">
            <h2 className="text-[22px] font-bold tracking-tight text-[#18181B]">排程</h2>
            <button
              type="button"
              onClick={() => setShowTasks((v) => !v)}
              aria-pressed={showTasks}
              aria-label={showTasks ? "隱藏目標底下的任務" : "顯示目標底下的任務"}
              title={showTasks ? "隱藏任務" : "顯示任務"}
              className={`w-10 h-10 rounded-full flex items-center justify-center transition-colors ${showTasks ? "bg-[#18181B] text-white" : "bg-white text-[#52525B] shadow-card"}`}
            >
              {/* 任務圖示（和底部導覽列「任務追蹤」同一個） */}
              <span className="material-symbols-outlined text-[22px]" style={{ fontVariationSettings: "'wght' 200" }}>
                checklist
              </span>
            </button>
          </div>
          <GoalGantt pm={pm} goals={goals} showTasks={showTasks} today={today} onOpenGoal={(id) => setSheet({ id })} onOpenTask={onOpenTask} />
        </>
      )}

      <GoalSheet pm={pm} open={!!sheet} goalId={sheet?.id ?? null} onClose={() => setSheet(null)} onOpenTask={onOpenTask} />
    </>
  );
}

function periodText(g: Goal, today: string): string {
  if (g.start && g.due) return `${fmtDate(g.start, today)} – ${fmtDate(g.due, today)}`;
  if (g.due) return `到 ${fmtDate(g.due, today)}`;
  if (g.start) return `${fmtDate(g.start, today)} 起`;
  return "未設定期間";
}

function GoalCard({ g, pm, onClick }: { g: GoalItem; pm: Pm; onClick: () => void }) {
  const over = !!g.due && g.due < pm.today && g.progress < 100;
  return (
    <button type="button" onClick={onClick} className="w-full bg-white rounded-[20px] shadow-card p-4 text-left flex gap-3 active:scale-[0.99] transition-transform">
      <span className="w-1.5 self-stretch rounded-full shrink-0" style={{ background: g.color }} aria-hidden />
      <span className="flex-1 min-w-0">
        <span className="flex items-start gap-2">
          <span className="flex-1 min-w-0 text-[16px] font-semibold text-[#18181B] leading-snug">{g.title}</span>
          {g.ownerEmail && <Avatar name={g.ownerName} email={g.ownerEmail} size={26} />}
        </span>
        <span className={`block text-[12.5px] mt-0.5 tabular-nums ${over ? "text-[#E5484D]" : "text-[#8E8E93]"}`}>
          {periodText(g, pm.today)}
          {over ? "・已過期" : ""}
        </span>
        <span className="mt-3 flex items-center gap-2.5">
          <span className="flex-1 h-2 rounded-full bg-[#F2F2F4] overflow-hidden">
            <span className="block h-full rounded-full transition-[width]" style={{ width: `${g.progress}%`, background: g.progress >= 100 ? GREEN : g.color }} />
          </span>
          <span className="text-[13px] font-semibold tabular-nums text-[#18181B] w-10 text-right">{g.progress}%</span>
        </span>
        <span className="block text-[12px] text-[#A1A1AA] mt-1.5 tabular-nums">
          {g.tasks.length ? `${g.doneCount} / ${g.tasks.length} 件完成` : "還沒有連結任務"}
          {g.lateCount > 0 && <span style={{ color: RED }}>・{g.lateCount} 件逾期</span>}
        </span>
      </span>
    </button>
  );
}

const FIT = { min: 3, max: 22 } as const;

function GoalGantt({
  pm,
  goals,
  showTasks,
  today,
  onOpenGoal,
  onOpenTask,
}: {
  pm: Pm;
  goals: GoalItem[];
  showTasks: boolean;
  today: string;
  onOpenGoal: (id: string) => void;
  onOpenTask: (t: Task) => void;
}) {
  const range = useMemo(() => {
    let s = today;
    let e = addDays(today, 30);
    const take = (a?: string, b?: string) => {
      const x = a ?? b;
      const y = b ?? a;
      if (x && x < s) s = x;
      if (y && y > e) e = y;
    };
    for (const g of goals) {
      take(g.start, g.due);
      if (showTasks) for (const t of g.tasks) take(t.start, t.due);
    }
    return { from: addDays(s, -3), to: addDays(e, 5) };
  }, [goals, showTasks, today]);

  const rows: GanttRow[] = [];
  for (const g of goals) {
    const start = g.start ?? g.due;
    const end = g.due ?? g.start;
    rows.push({
      id: g.id,
      label: g.title,
      sublabel: g.ownerEmail ? `負責：${personLabel(pm, g.ownerEmail, g.ownerName)}` : `${g.progress}%`,
      onClick: () => onOpenGoal(g.id),
      trailing: `${g.progress}%`,
      bars:
        start && end
          ? [
              {
                start,
                end: end < start ? start : end,
                progress: g.progress,
                fill: g.color,
                tip: (
                  <>
                    <b>{g.title}</b>
                    <br />
                    {periodText(g, today)}　·　{g.progress}%
                    <br />
                    {g.tasks.length ? `${g.doneCount} / ${g.tasks.length} 件完成` : "還沒有連結任務"}
                  </>
                ),
              },
            ]
          : [],
    });
    if (!showTasks) continue;
    for (const t of g.tasks) {
      const ts = t.start ?? t.due;
      const te = t.due ?? t.start;
      const done = t.status === "done";
      rows.push({
        id: `${g.id}:${t.id}`,
        label: `　${t.title}`,
        sublabel: `　${assigneeLabel(pm, t)}`,
        onClick: () => onOpenTask(t),
        trailing: done ? "完成" : isLate(t, today) ? "逾期" : t.progress ? `${t.progress}%` : undefined,
        bars:
          ts && te
            ? [
                {
                  start: ts,
                  end: te < ts ? ts : te,
                  progress: done ? 100 : t.progress,
                  fill: done ? GREEN : `color-mix(in srgb, ${g.color} 55%, #A1A1AA)`,
                  late: isLate(t, today),
                  dashed: t.kind === "等待",
                  tip: (
                    <>
                      <b>{t.title}</b>
                      <br />
                      {pm.projectBy.get(t.code)?.name ?? t.code}　·　{STATUS_LABEL[t.status]}
                    </>
                  ),
                },
              ]
            : [],
      });
    }
  }

  return (
    <div className="bg-white rounded-[14px] border border-[#EBEBED] overflow-hidden">
      <Gantt fit={FIT} anchor={0.25} today={today} from={range.from} to={range.to} dayWidth={10} labelWidth={150} rows={rows} />
    </div>
  );
}

/* ── 目標細節（新增／編輯；員工只能看） ───────────────────── */

type Draft = Pick<Goal, "title" | "ownerEmail" | "start" | "due" | "color" | "note">;

export function GoalSheet({
  pm,
  open,
  goalId,
  onClose,
  onOpenTask,
}: {
  pm: Pm;
  open: boolean;
  goalId: string | null;
  onClose: () => void;
  onOpenTask?: (t: Task) => void;
}) {
  const goal = goalId ? pm.goalBy.get(goalId) : undefined;
  const isNew = !goalId;
  const canEdit = pm.isManager;
  const initial = useMemo<Draft>(
    () =>
      goal
        ? { title: goal.title, ownerEmail: goal.ownerEmail, start: goal.start, due: goal.due, color: goal.color, note: goal.note }
        : { title: "", color: GOAL_COLORS[pm.goals.length % GOAL_COLORS.length], start: pm.today },
    // 以打開當下為準
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [open, goalId]
  );
  const [d, setD] = useState<Draft>(initial);
  const [confirmDel, setConfirmDel] = useState(false);
  useEffect(() => {
    if (!open) return;
    setD(initial);
    setConfirmDel(false);
  }, [open, initial]);

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((c) => ({ ...c, [k]: v }));
  const dirty = canEdit && JSON.stringify(d) !== JSON.stringify(initial);

  const save = async () => {
    if (!d.title.trim()) return toast("請輸入目標名稱", { tone: "error" });
    if (d.start && d.due && d.due < d.start) return toast("結束日早於開始日", { tone: "error" });
    const patch: Partial<Goal> & { id?: string } = { id: goal?.id };
    (Object.keys(d) as (keyof Draft)[]).forEach((k) => {
      if (isNew || JSON.stringify(d[k]) !== JSON.stringify(initial[k])) (patch as Record<string, unknown>)[k] = d[k];
    });
    if (patch.title) patch.title = patch.title.trim();
    onClose();
    const saved = await pm.saveGoal(patch);
    if (saved && isNew) toast(`已新增目標「${saved.title}」`);
  };

  const remove = async () => {
    if (!goal) return;
    onClose();
    if (await pm.deleteGoal(goal.id)) toast(`已刪除目標「${goal.title}」，連結的任務保留`);
  };

  const footer = !canEdit ? undefined : confirmDel ? (
    <div className="flex gap-2">
      <button type="button" onClick={() => setConfirmDel(false)} className="flex-1 h-12 rounded-[14px] bg-[#F4F4F5] text-[15px] font-semibold text-[#18181B]">
        不刪除
      </button>
      <button type="button" onClick={remove} className="flex-1 h-12 rounded-[14px] bg-[#E5484D] text-[15px] font-semibold text-white">
        確定刪除
      </button>
    </div>
  ) : (
    <div className="flex gap-2">
      {!isNew && (
        <button type="button" onClick={() => setConfirmDel(true)} aria-label="刪除目標" className="w-12 h-12 rounded-[14px] bg-[#F4F4F5] flex items-center justify-center text-[#E5484D]">
          <Icon name="delete" className="text-[21px]" />
        </button>
      )}
      <button type="button" onClick={save} className="flex-1 h-12 rounded-[14px] text-[15px] font-semibold text-white" style={{ background: ORANGE }}>
        {isNew ? "新增目標" : "儲存"}
      </button>
    </div>
  );

  return (
    <Sheet open={open} title={isNew ? "新增公司目標" : goal?.title ?? "公司目標"} subtitle={goal ? periodText(goal, pm.today) : undefined} onClose={onClose} dirty={dirty} footer={footer}>
      <div className="pb-5">
        {goal && (
          <section className="px-4 pt-4">
            <div className="bg-white rounded-[16px] border border-[#E4E4E7]/70 p-4">
              <div className="flex items-end justify-between">
                <span className="text-[13px] text-[#8E8E93]">進度（依連結任務自動計算）</span>
                <span className="text-[24px] font-bold tabular-nums text-[#18181B]">{goal.progress}%</span>
              </div>
              <div className="h-2.5 rounded-full bg-[#F2F2F4] overflow-hidden mt-2">
                <div className="h-full rounded-full" style={{ width: `${goal.progress}%`, background: goal.progress >= 100 ? GREEN : goal.color }} />
              </div>
              <p className="text-[12.5px] text-[#A1A1AA] mt-2 tabular-nums">
                {goal.tasks.length ? `${goal.doneCount} / ${goal.tasks.length} 件完成` : "還沒有連結任務：新增或編輯任務時選「所屬目標」"}
              </p>
            </div>
          </section>
        )}

        {canEdit ? (
          <>
            <FieldGroup title="目標">
              <TextField label="名稱" value={d.title} onChange={(v) => set("title", v)} placeholder="例：Q4 完成 3 案交屋" />
              <TextField label="說明／衡量方式" value={d.note} onChange={(v) => set("note", v || undefined)} placeholder="怎樣算達成？例：3 案都完成聯合驗收" multiline />
            </FieldGroup>
            <FieldGroup title="期間">
              <DateField label="開始" value={d.start} onChange={(v) => set("start", v)} today={pm.today} />
              <DateField label="結束" value={d.due} onChange={(v) => set("due", v)} today={pm.today} min={d.start} />
            </FieldGroup>
            <FieldGroup title="負責人與顏色">
              <Row label="負責人">
                <div className="flex gap-2 overflow-x-auto scrollbar-hide -mx-1 px-1 pb-1">
                  {pm.people.map((p) => {
                    const on = d.ownerEmail === p.email;
                    return (
                      <button
                        key={p.email}
                        type="button"
                        onClick={() => set("ownerEmail", on ? undefined : p.email)}
                        aria-pressed={on}
                        className={`shrink-0 h-10 pl-1 pr-3 rounded-full flex items-center gap-1.5 text-[14px] transition-colors ${on ? "bg-[var(--accent-soft)] text-[var(--accent-ink)] font-semibold" : "bg-[#F4F4F5] text-[#3F3F46]"}`}
                      >
                        <Avatar name={p.name} email={p.email} size={30} />
                        {p.email === pm.me?.email ? "我" : p.name}
                      </button>
                    );
                  })}
                </div>
              </Row>
              <Row label="顏色">
                <div className="flex gap-2.5 flex-wrap">
                  {GOAL_COLORS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => set("color", c)}
                      aria-label={`顏色 ${c}`}
                      aria-pressed={d.color === c}
                      className="w-9 h-9 rounded-full flex items-center justify-center"
                      style={{ background: c, boxShadow: d.color === c ? `0 0 0 3px #fff, 0 0 0 5px ${c}` : undefined }}
                    >
                      {d.color === c && <Icon name="check" weight={700} className="text-[18px] text-white" />}
                    </button>
                  ))}
                </div>
              </Row>
            </FieldGroup>
          </>
        ) : (
          goal && (
            <section className="px-4 pt-4">
              <div className="bg-white rounded-[16px] border border-[#E4E4E7]/70 divide-y divide-[#F4F4F5]">
                {goal.ownerEmail && (
                  <div className="px-4 py-3 flex items-center gap-3">
                    <Avatar name={goal.ownerName} email={goal.ownerEmail} size={30} />
                    <span className="text-[15px] text-[#18181B]">負責：{personLabel(pm, goal.ownerEmail, goal.ownerName)}</span>
                  </div>
                )}
                {goal.note && <p className="px-4 py-3 text-[14px] text-[#3F3F46] leading-relaxed whitespace-pre-line">{goal.note}</p>}
              </div>
            </section>
          )
        )}

        {goal && goal.tasks.length > 0 && (
          <FieldGroup title={`連結的任務（${goal.tasks.length}）`}>
            {goal.tasks.map((t) => {
              const done = t.status === "done";
              const late = isLate(t, pm.today);
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => {
                    if (!onOpenTask) return;
                    onClose();
                    onOpenTask(t);
                  }}
                  className="w-full px-4 py-3 flex items-center gap-3 text-left active:bg-[#FAFAFA]"
                >
                  <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: done ? GREEN : late ? RED : t.status === "doing" ? ORANGE : "#C7C7CC" }} />
                  <span className="flex-1 min-w-0">
                    <span className={`block text-[15px] truncate ${done ? "text-[#A1A1AA] line-through" : "text-[#18181B]"}`}>{t.title}</span>
                    <span className="block text-[12px] text-[#8E8E93] truncate">
                      {assigneeLabel(pm, t)}
                      {t.due ? `・${fmtDate(t.due, pm.today)}` : ""}
                    </span>
                  </span>
                  <span className="text-[12px] tabular-nums" style={{ color: late ? RED : "#A1A1AA" }}>
                    {done ? "完成" : late ? "逾期" : STATUS_LABEL[t.status]}
                  </span>
                </button>
              );
            })}
          </FieldGroup>
        )}
      </div>
    </Sheet>
  );
}

/** 任務表單裡的「所屬目標」選擇 */
export function GoalPicker({ pm, value, onPick }: { pm: Pm; value?: string; onPick: (id: string | undefined) => void }) {
  return (
    <div className="px-3 py-2.5 bg-[#FAFAFA]">
      <div className="max-h-[260px] overflow-y-auto overscroll-contain rounded-[10px] bg-white border border-[#EBEBED] divide-y divide-[#F2F2F4]">
        <button type="button" onClick={() => onPick(undefined)} className={`w-full flex items-center gap-3 px-3 h-12 text-left active:bg-[#F4F4F5] ${!value ? "bg-[var(--accent-soft)]" : ""}`}>
          <span className="w-2.5 h-2.5 rounded-full shrink-0 border border-[#C7C7CC]" />
          <span className="flex-1 text-[15px] text-[#71717A]">不連結目標</span>
        </button>
        {pm.goals.map((g) => (
          <button
            key={g.id}
            type="button"
            onClick={() => onPick(g.id)}
            className={`w-full flex items-center gap-3 px-3 h-12 text-left active:bg-[#F4F4F5] ${value === g.id ? "bg-[var(--accent-soft)]" : ""}`}
          >
            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: g.color }} />
            <span className="flex-1 min-w-0 text-[15px] text-[#18181B] truncate">{g.title}</span>
            <span className="text-[12px] text-[#A1A1AA] tabular-nums">{g.progress}%</span>
          </button>
        ))}
      </div>
    </div>
  );
}
