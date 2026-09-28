"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import useSWR from "swr";
import { fmtDate, fmtMoney, STAGES, type Stage } from "@/lib/project-ops";
import { personColor, type PmPhoto, type Task } from "@/lib/pm/model";
import { HealthBadge, Icon, ProgressBar, SubScreen } from "./ui";
import { Avatar, AvatarStack, Empty, Group, ORANGE, SegmentedIcons, Spinner } from "./kit";
import { TaskList } from "./TaskList";
import { TaskBoard } from "./TaskBoard";
import { TaskGantt } from "./TaskGantt";
import { TaskSheet } from "./TaskSheet";
import { ProjectInfoSheet } from "./ProjectInfoSheet";
import { PhotoUpload } from "./PhotoUpload";
import { toast } from "./Sheet";
import type { Pm, ProjectItem } from "./usePm";

/* ══════════════════════════════════════════════════════════
   專案頁：一個專案的全部 —— 任務（清單／看板／甘特）、照片、資料
   ══════════════════════════════════════════════════════════ */

type Section = "tasks" | "photos" | "info";
type View = "list" | "board" | "gantt";

export function ProjectScreen({ pm, code, onClose }: { pm: Pm; code: string | null; onClose: () => void }) {
  const p = code ? pm.projectBy.get(code) : undefined;
  const last = useRef<ProjectItem | undefined>(p);
  if (p) last.current = p;
  const shown = p ?? last.current;

  const [section, setSection] = useState<Section>("tasks");
  const [view, setView] = useState<View>("list");
  const [sheet, setSheet] = useState<{ id: string | null; preset?: Partial<Task> } | null>(null);
  const [editInfo, setEditInfo] = useState(false);
  const [upload, setUpload] = useState(false);
  const [stageMenu, setStageMenu] = useState(false);
  const [showDone, setShowDone] = useState(false);
  const [showPeople, setShowPeople] = useState(false);

  useEffect(() => {
    setSection("tasks");
    setStageMenu(false);
    setShowDone(false);
    setShowPeople(false);
  }, [code]);

  const setStage = async (s: Stage) => {
    setStageMenu(false);
    if (!shown || s === shown.stage) return;
    const ok = await pm.saveProject(shown.code, { stage: s });
    if (ok) toast(`階段改為「${s}」`);
  };

  return (
    <>
      <SubScreen
        open={!!p}
        title={shown?.name ?? ""}
        subtitle={shown ? `${shown.code}　·　${shown.company || "APP 新建"}` : undefined}
        onClose={onClose}
        scrollKey={code ?? ""}
        headerAction={
          shown && pm.isManager ? (
            <button onClick={() => setEditInfo(true)} className="h-11 px-3 rounded-full text-[15px] font-semibold text-[#18181B] active:bg-[#F4F4F5]">
              編輯
            </button>
          ) : undefined
        }
        bottomBar={
          shown ? (
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setSheet({ id: null, preset: { code: shown.code } })}
                className="h-[52px] rounded-[14px] text-white text-[15px] font-semibold inline-flex items-center justify-center gap-1.5 active:opacity-85"
                style={{ background: ORANGE }}
              >
                <Icon name="add_task" weight={400} className="text-[21px]" />
                新增任務
              </button>
              <button
                onClick={() => setUpload(true)}
                className="h-[52px] rounded-[14px] bg-[#F4F4F5] text-[#18181B] text-[15px] font-semibold inline-flex items-center justify-center gap-1.5 active:bg-[#E4E4E7]"
              >
                <Icon name="add_a_photo" weight={400} className="text-[21px]" />
                上傳照片
              </button>
            </div>
          ) : undefined
        }
      >
        {shown && (
          <div className="px-5 py-5 max-w-3xl mx-auto flex flex-col gap-4">
            {/* 摘要 */}
            <Group className="p-4">
              <div className="flex items-center gap-2 flex-wrap">
                <div className="relative">
                  <button
                    disabled={!pm.isManager}
                    onClick={() => setStageMenu((v) => !v)}
                    className="h-9 pl-3 pr-2 rounded-full bg-[#F4F4F5] text-[14px] font-semibold text-[#18181B] inline-flex items-center gap-0.5 disabled:pr-3"
                  >
                    {shown.stage ?? "未設定階段"}
                    {pm.isManager && <Icon name="expand_more" className="text-[18px]" />}
                  </button>
                  {stageMenu && (
                    <div className="absolute z-10 top-11 left-0 w-44 bg-white rounded-[14px] border border-[#E4E4E7] shadow-[0_12px_30px_rgba(0,0,0,0.12)] py-1">
                      {STAGES.map((s) => (
                        <button key={s} onClick={() => setStage(s)} className="w-full h-10 px-4 text-left text-[15px] text-[#18181B] flex items-center justify-between active:bg-[#F4F4F5]">
                          {s}
                          {s === shown.stage && <Icon name="check" weight={500} className="text-[18px]" style={{ color: ORANGE }} />}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <HealthBadge health={shown.view.health} />
                {shown.photoCount > 0 && (
                  <button onClick={() => setSection("photos")} className="h-7 px-2.5 rounded-full bg-[#F4F4F5] text-[12px] text-[#52525B] inline-flex items-center gap-1">
                    <Icon name="photo_library" className="text-[15px]" />
                    {shown.photoCount}
                  </button>
                )}
              </div>
              {shown.view.reason && <p className="text-[13px] text-[#71717A] mt-2">{shown.view.reason}</p>}
              <div className="mt-4">
                <div className="flex items-baseline justify-between mb-1.5">
                  <span className="text-[13px] text-[#8E8E93]">進度</span>
                  <span className="text-[13px] text-[#8E8E93]">
                    <b className="text-[22px] font-bold text-[#18181B] tabular-nums">{shown.view.ops?.progress ?? 0}</b>%
                    {shown.view.plannedPct !== undefined && <span className="ml-2">計畫 {shown.view.plannedPct}%</span>}
                  </span>
                </div>
                <ProgressBar actual={shown.view.ops?.progress} planned={shown.view.plannedPct} health={shown.view.health} height={8} />
              </div>
              <div className="grid grid-cols-3 gap-2 mt-4 text-center">
                <Stat label="開工" value={shown.startAt ? fmtDate(shown.startAt, pm.today) : "—"} />
                <Stat label="預計完工" value={shown.dueAt ? fmtDate(shown.dueAt, pm.today) : "—"} />
                <Stat
                  label={shown.view.daysLeft !== undefined && shown.view.daysLeft < 0 ? "已逾期" : "剩餘"}
                  value={shown.view.daysLeft === undefined ? "—" : `${Math.abs(shown.view.daysLeft)} 天`}
                  warn={shown.view.daysLeft !== undefined && shown.view.daysLeft < 0}
                />
              </div>
              {shown.note && (
                <p className="mt-4 text-[14px] text-[#3F3F46] bg-[#FAFAFA] rounded-[12px] px-3 py-2.5 leading-relaxed">
                  <span className="text-[12px] text-[#A1A1AA] block mb-0.5">近況</span>
                  {shown.note}
                </p>
              )}
              {/* 參與者：小頭像疊在一起，點開看每個人手上幾件 */}
              <div className="mt-4 pt-3 border-t border-[#F2F2F4] flex items-center justify-between gap-2">
                {shown.participants.length ? (
                  <button onClick={() => setShowPeople((v) => !v)} className="flex items-center gap-2 min-h-[40px] -ml-1 pl-1 pr-2 rounded-full active:bg-[#F4F4F5] shrink-0" aria-expanded={showPeople}>
                    <AvatarStack people={shown.participants} max={5} size={30} label={`${shown.participants.length} 位參與者`} />
                    <span className="text-[13px] text-[#71717A] whitespace-nowrap">{shown.participants.length} 位參與</span>
                    <Icon name={showPeople ? "expand_less" : "expand_more"} className="text-[18px] text-[#A1A1AA]" />
                  </button>
                ) : (
                  <span className="text-[13px] text-[#A1A1AA]">還沒有指派任何人</span>
                )}
                {shown.manager && <span className="text-[12.5px] text-[#8E8E93] truncate min-w-0">主任 {shown.manager}</span>}
              </div>
              {showPeople && (
                <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-1">
                  {shown.participants.map((u) => (
                    <div key={u.email} className="flex items-center gap-2.5 px-1 py-1.5">
                      <Avatar name={u.name} email={u.email} size={34} />
                      <span className="flex-1 min-w-0 text-[14px] text-[#18181B] truncate">{u.email === pm.me?.email ? `${u.name}（我）` : u.name}</span>
                      <span className="text-[12.5px] text-[#8E8E93] tabular-nums">{u.open ? `${u.open} 件進行中` : "已完成"}</span>
                    </div>
                  ))}
                </div>
              )}
            </Group>

            {/* 分段 */}
            <div role="tablist" className="grid grid-cols-3 p-[3px] rounded-[12px] bg-[#EEEEF0]">
              {(
                [
                  ["tasks", `任務 ${shown.openCount || ""}`],
                  ["photos", `照片 ${shown.photoCount || ""}`],
                  ["info", "資料"],
                ] as [Section, string][]
              ).map(([k, label]) => (
                <button
                  key={k}
                  role="tab"
                  aria-selected={section === k}
                  onClick={() => setSection(k)}
                  className={`h-9 rounded-[9px] text-[14px] font-semibold transition-all ${section === k ? "bg-white text-[#18181B] shadow-[0_1px_3px_rgba(0,0,0,0.12)]" : "text-[#71717A]"}`}
                >
                  {label.trim()}
                </button>
              ))}
            </div>

            {section === "tasks" && (
              <>
                <div className="flex items-center justify-between gap-2">
                  <button
                    onClick={() => setShowDone(!showDone)}
                    aria-pressed={showDone}
                    className={`h-9 px-3 rounded-full text-[13px] font-medium inline-flex items-center gap-1 ${showDone ? "bg-[#18181B] text-white" : "text-[#3F3F46] bg-white border border-[#E4E4E7]"}`}
                  >
                    <Icon name="check" className="text-[16px]" />
                    顯示已完成（{shown.tasks.length - shown.openCount}）
                  </button>
                  <SegmentedIcons
                    label="檢視方式"
                    value={view}
                    onChange={setView}
                    options={[
                      { value: "list", icon: "checklist", label: "清單" },
                      { value: "board", icon: "view_kanban", label: "看板" },
                      { value: "gantt", icon: "view_timeline", label: "甘特" },
                    ]}
                  />
                </div>
                {view === "list" && (
                  <TaskList
                    pm={pm}
                    tasks={shown.tasks}
                    groupBy="manual"
                    showAssignee
                    showDone={showDone}
                    onOpen={(t) => setSheet({ id: t.id })}
                    quickAddCode={pm.isManager ? shown.code : undefined}
                    onAdd={pm.isManager ? undefined : () => setSheet({ id: null, preset: { code: shown.code } })}
                    emptyText="還沒有任務。輸入第一個工項，按 Enter 接著加下一個。"
                  />
                )}
                {view === "board" && <TaskBoard pm={pm} tasks={shown.tasks} onOpen={(t) => setSheet({ id: t.id })} onAdd={() => setSheet({ id: null, preset: { code: shown.code } })} />}
                {view === "gantt" && <TaskGantt pm={pm} tasks={shown.tasks.filter((t) => showDone || t.status !== "done")} onOpen={(t) => setSheet({ id: t.id })} />}
              </>
            )}
            {section === "photos" && <Photos pm={pm} project={shown} onUpload={() => setUpload(true)} />}
            {section === "info" && <Info pm={pm} project={shown} onEdit={() => setEditInfo(true)} />}
          </div>
        )}
      </SubScreen>

      <TaskSheet pm={pm} open={!!sheet} taskId={sheet?.id ?? null} preset={sheet?.preset} onClose={() => setSheet(null)} />
      {shown && pm.isManager && <ProjectInfoSheet pm={pm} code={shown.code} open={editInfo} onClose={() => setEditInfo(false)} />}
      {shown && <PhotoUpload open={upload} onClose={() => setUpload(false)} presetCode={shown.code} />}
    </>
  );
}

function Stat({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className="rounded-[12px] bg-[#FAFAFA] py-2">
      <p className="text-[11.5px] text-[#8E8E93]">{label}</p>
      <p className={`text-[15px] font-semibold tabular-nums ${warn ? "text-[#E5484D]" : "text-[#18181B]"}`}>{value}</p>
    </div>
  );
}

/* ── 照片 ─────────────────────────────────────────────── */

const photoFetcher = async (url: string): Promise<PmPhoto[]> => {
  const r = await fetch(url, { cache: "no-store" });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error || "讀不到照片");
  return j.items;
};

function Photos({ pm, project, onUpload }: { pm: Pm; project: ProjectItem; onUpload: () => void }) {
  const { data, error, isLoading } = useSWR(`/api/pm/photos?code=${encodeURIComponent(project.code)}&n=${project.photoCount}`, photoFetcher, {
    revalidateOnFocus: false,
  });
  const groups = useMemo(() => {
    const by = new Map<string, PmPhoto[]>();
    for (const ph of data ?? []) {
      const k = ph.takenOn ?? ph.createdAt.slice(0, 10);
      by.set(k, [...(by.get(k) ?? []), ph]);
    }
    return [...by.entries()].sort(([a], [b]) => b.localeCompare(a));
  }, [data]);
  const folder = project.driveFolderId ? `https://drive.google.com/drive/folders/${project.driveFolderId}` : undefined;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <button onClick={onUpload} className="h-10 px-4 rounded-full text-white text-[14px] font-semibold inline-flex items-center gap-1.5" style={{ background: ORANGE }}>
          <Icon name="add_a_photo" weight={400} className="text-[18px]" />
          上傳照片
        </button>
        {folder && (
          <a href={folder} target="_blank" rel="noreferrer" className="h-10 px-4 rounded-full bg-white border border-[#E4E4E7] text-[14px] font-semibold text-[#18181B] inline-flex items-center gap-1.5">
            <Icon name="folder_open" className="text-[18px]" />
            雲端資料夾
          </a>
        )}
      </div>
      {isLoading && !data ? (
        <div className="flex justify-center py-10">
          <Spinner size={20} />
        </div>
      ) : error ? (
        <p className="text-[14px] text-[#71717A]">{String(error.message)}</p>
      ) : !data?.length ? (
        <Group>
          <Empty icon="photo_camera" title="還沒有工程照" hint="用下方「上傳照片」或底部的「＋」拍照，照片會自動放進這個專案雲端資料夾的「工程照」。" />
        </Group>
      ) : (
        groups.map(([day, list]) => (
          <section key={day}>
            <h3 className="text-[14px] font-bold text-[#18181B] px-1 mb-2">
              {fmtDate(day, pm.today)} <span className="text-[#A1A1AA] font-normal">· {list.length} 張</span>
            </h3>
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
              {list.map((ph) => (
                <a key={ph.id} href={ph.driveUrl} target="_blank" rel="noreferrer" className="block">
                  <span className="block aspect-square rounded-[10px] overflow-hidden bg-[#F2F2F4]">
                    {ph.thumb ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={ph.thumb} alt={ph.caption ?? ph.fileName} className="w-full h-full object-cover" loading="lazy" />
                    ) : (
                      <span className="w-full h-full flex items-center justify-center">
                        <Icon name="image" className="text-[28px] text-[#C7C7CC]" />
                      </span>
                    )}
                  </span>
                  <span className="block text-[12px] text-[#3F3F46] truncate mt-1">{ph.caption || "工程照"}</span>
                  <span className="block text-[11px] text-[#A1A1AA] truncate">{ph.uploadedByName}</span>
                </a>
              ))}
            </div>
          </section>
        ))
      )}
    </div>
  );
}

/* ── 資料 ─────────────────────────────────────────────── */

function Info({ pm, project: p, onEdit }: { pm: Pm; project: ProjectItem; onEdit: () => void }) {
  const rows: [string, React.ReactNode][] = [
    ["工程類別", p.view.category],
    ["工地主任", p.manager],
    ["業主", p.client],
    ["工地地址", p.site],
    ["簽約日", p.signedAt && fmtDate(p.signedAt, pm.today)],
    ["開工日", p.startAt && fmtDate(p.startAt, pm.today)],
    ["預計完工", p.dueAt && fmtDate(p.dueAt, pm.today)],
    ["實際完工", p.doneAt && fmtDate(p.doneAt, pm.today)],
  ];
  const money: [string, React.ReactNode][] = pm.isManager
    ? [
        ["合約金額", p.contract !== undefined && fmtMoney(p.contract)],
        ["追加減", p.variation !== undefined && fmtMoney(p.variation)],
        ["已請款", p.billed !== undefined && fmtMoney(p.billed)],
        ["已收款", p.collected !== undefined && fmtMoney(p.collected)],
        ["應收未收", p.view.receivable !== undefined && fmtMoney(p.view.receivable)],
      ]
    : [];
  const Block = ({ title, list }: { title: string; list: [string, React.ReactNode][] }) => (
    <section>
      <h3 className="text-[13px] font-bold text-[#8E8E93] px-1 mb-1.5">{title}</h3>
      <Group>
        {list.map(([k, v], i) => (
          <div key={k} className={`flex gap-4 px-4 py-3 ${i ? "border-t border-[#F2F2F4]" : ""}`}>
            <span className="w-[76px] shrink-0 text-[14px] text-[#8E8E93]">{k}</span>
            <span className="flex-1 min-w-0 text-[15px] text-[#18181B] break-words">{v || <span className="text-[#C7C7CC]">未填</span>}</span>
          </div>
        ))}
      </Group>
    </section>
  );
  return (
    <div className="flex flex-col gap-4">
      <Block title="基本資料" list={rows} />
      {money.length > 0 && <Block title="合約與請款" list={money} />}
      <section>
        <h3 className="text-[13px] font-bold text-[#8E8E93] px-1 mb-1.5">雲端資料夾</h3>
        <Group>
          {p.driveFolderId ? (
            <a href={`https://drive.google.com/drive/folders/${p.driveFolderId}`} target="_blank" rel="noreferrer" className="flex items-center gap-3 px-4 h-12 text-[15px] text-[#18181B]">
              <Icon name="folder" fill={1} className="text-[22px]" style={{ color: personColor(p.code) }} />
              開啟專案資料夾
              <Icon name="open_in_new" className="text-[17px] text-[#A1A1AA] ml-auto" />
            </a>
          ) : (
            <p className="px-4 py-3 text-[13px] text-[#8E8E93]">還沒連結。第一次上傳工程照時會依代碼自動找到資料夾，或在「編輯」貼上連結。</p>
          )}
        </Group>
      </section>
      {pm.isManager && (
        <button onClick={onEdit} className="h-12 rounded-[14px] bg-white border border-[#E4E4E7] text-[15px] font-semibold text-[#18181B] inline-flex items-center justify-center gap-1.5">
          <Icon name="edit" className="text-[18px]" />
          編輯專案資料
        </button>
      )}
    </div>
  );
}
