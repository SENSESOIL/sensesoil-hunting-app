"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import useSWR from "swr";
import { CATEGORIES, STAGES, fmtDate, fmtMoney, parseMoney, validateRecord, weightedProgress, type Risk, type Stage } from "@/lib/project-ops";
import { personColor, taskToWorkItem, type PmPhoto, type PmProject } from "@/lib/pm/model";
import { HealthBadge, Icon, ProgressBar, SubScreen } from "./ui";
import { Avatar, AvatarStack, Empty, Group, Spinner } from "./kit";
import { fmtDateLong } from "./fields";
import { DeleteProject, folderIdFrom } from "./ProjectInfoSheet";
import { toast } from "./Sheet";
import type { Pm, ProjectItem } from "./usePm";
import { tourEmit } from "./tour/bus";

/* ══════════════════════════════════════════════════════════
   專案頁：看一眼就知道專案的狀況，資料直接在這頁改
   - 上面：摘要卡（階段、健康度、進度、工期、參與者），只看不改
   - 下面：「資料｜照片」
     資料像 iPhone「設定」：左邊項目、右邊目前的值，點右邊直接改，改完自動存（不用按編輯、儲存）
     沒有管理權限的人只看得到值
   - 任務在「任務追蹤」看、照片從底部「＋」上傳，這頁不放新增按鈕
   ══════════════════════════════════════════════════════════ */

type Section = "info" | "photos";
type SaveState = "idle" | "saving" | "saved";
const RISKS: Risk[] = ["正常", "注意", "異常"];

export function ProjectScreen({ pm, code, onClose }: { pm: Pm; code: string | null; onClose: () => void }) {
  const p = code ? pm.projectBy.get(code) : undefined;
  const last = useRef<ProjectItem | undefined>(p);
  if (p) last.current = p;
  const shown = p ?? last.current;

  const [section, setSection] = useState<Section>("info");
  const [showPeople, setShowPeople] = useState(false);
  const [save, setSave] = useState<SaveState>("idle");
  const savedTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  // 新手教學：專案頁打開了哪個專案（關掉＝null）
  useEffect(() => tourEmit("project-screen", p ? code : null), [!!p, code]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    setSection("info");
    setShowPeople(false);
    setSave("idle");
  }, [code]);

  /** 改一個（或幾個）欄位就存；日期前後矛盾之類的錯誤不存、跳提示，畫面會回到原本的值 */
  const commit = async (patch: Partial<PmProject>): Promise<boolean> => {
    if (!shown) return false;
    const keys = Object.keys(patch);
    const bad = validateRecord({ ...shown, ...patch } as never, pm.today).find((i) => i.level === "error" && keys.includes(i.field));
    if (bad) {
      toast(bad.message, { tone: "error" });
      return false;
    }
    clearTimeout(savedTimer.current);
    setSave("saving");
    const ok = await pm.saveProject(shown.code, patch);
    setSave(ok ? "saved" : "idle");
    if (ok) savedTimer.current = setTimeout(() => setSave("idle"), 1600);
    return ok;
  };

  return (
    <SubScreen
      open={!!p}
      title={shown?.name ?? ""}
      subtitle={shown?.code}
      onClose={onClose}
      scrollKey={code ?? ""}
      headerAction={
        save !== "idle" ? (
          <span className="px-3 text-[13px] text-[#8E8E93] inline-flex items-center gap-1" aria-live="polite">
            {save === "saving" ? <Spinner size={13} /> : <Icon name="check" weight={500} className="text-[16px] text-[#30A46C]" />}
            {save === "saving" ? "儲存中" : "已儲存"}
          </span>
        ) : undefined
      }
    >
      {shown && (
        <div className="px-4 sm:px-5 pt-4 pb-10 max-w-2xl mx-auto flex flex-col gap-4">
          {/* 摘要：只看 */}
          <div data-tour="project-summary">
          <Group className="p-4">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="h-8 px-3 rounded-full bg-[#F4F4F5] text-[14px] font-semibold text-[#18181B] inline-flex items-center">{shown.stage ?? "未設定階段"}</span>
              <HealthBadge health={shown.view.health} />
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
              {shown.openCount > 0 && <span className="text-[12.5px] text-[#8E8E93] whitespace-nowrap">{shown.openCount} 項任務進行中</span>}
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
          </div>

          {/* 資料｜照片 */}
          <div role="tablist" className="grid grid-cols-2 p-[3px] rounded-[12px] bg-[#EEEEF0]">
            {(
              [
                ["info", "資料"],
                ["photos", shown.photoCount ? `照片 ${shown.photoCount}` : "照片"],
              ] as [Section, string][]
            ).map(([k, label]) => (
              <button
                key={k}
                role="tab"
                aria-selected={section === k}
                onClick={() => setSection(k)}
                className={`h-9 rounded-[9px] text-[14px] font-semibold transition-all ${section === k ? "bg-white text-[#18181B] shadow-[0_1px_3px_rgba(0,0,0,0.12)]" : "text-[#71717A]"}`}
              >
                {label}
              </button>
            ))}
          </div>

          {section === "info" ? <Details pm={pm} p={shown} commit={commit} onDeleted={onClose} /> : <Photos pm={pm} project={shown} />}
        </div>
      )}
    </SubScreen>
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

/* ── 資料（直接改） ─────────────────────────────────────── */

function Details({ pm, p, commit, onDeleted }: { pm: Pm; p: ProjectItem; commit: (patch: Partial<PmProject>) => Promise<boolean>; onDeleted: () => void }) {
  const edit = pm.isManager;
  const auto = useMemo(() => weightedProgress(p.tasks.map(taskToWorkItem)), [p.tasks]);
  const warns = validateRecord(p as never, pm.today).filter((i) => i.level === "warn");
  const folder = p.driveFolderId ? `https://drive.google.com/drive/folders/${p.driveFolderId}` : undefined;

  return (
    <div className="flex flex-col gap-6">
      {/* APP 新建的專案才能改名稱；CRM 名冊上的以 CRM 為準 */}
      {!p.inCrm && (
        <List title="專案">
          <TextLine label="名稱" value={p.name} edit={edit} placeholder="專案名稱" onCommit={(v) => (v ? commit({ name: v }) : (toast("名稱不能空白", { tone: "error" }), Promise.resolve(false)))} />
          <TextLine label="單位" value={p.company} edit={edit} placeholder="例：拾壤" onCommit={(v) => commit({ company: v })} />
        </List>
      )}

      <List title="狀態">
        <PickLine label="階段" value={p.stage} options={STAGES} edit={edit} onCommit={(v) => commit({ stage: v as Stage })} />
        <PickLine label="風險" value={p.risk} options={RISKS} edit={edit} allowEmpty onCommit={(v) => commit({ risk: v as Risk | undefined })} />
        <ProgressLine value={p.progress} auto={auto} edit={edit} onCommit={(v) => commit({ progress: v })} />
      </List>

      <List title="時程" foot={warns.filter((w) => /At$/.test(w.field)).map((w) => w.message).join("　")}>
        <DateLine label="簽約日" value={p.signedAt} today={pm.today} edit={edit} onCommit={(v) => commit({ signedAt: v })} />
        <DateLine label="開工日" value={p.startAt} today={pm.today} edit={edit} onCommit={(v) => commit({ startAt: v })} />
        <DateLine label="預計完工" value={p.dueAt} today={pm.today} edit={edit} min={p.startAt} onCommit={(v) => commit({ dueAt: v })} />
        <DateLine label="實際完工" value={p.doneAt} today={pm.today} edit={edit} onCommit={(v) => commit({ doneAt: v })} />
      </List>

      {pm.isManager && (
        <List
          title="合約與請款"
          foot={
            p.contract !== undefined || p.billed !== undefined
              ? `合約合計 ${fmtMoney((p.contract ?? 0) + (p.variation ?? 0))}　·　應收未收 ${fmtMoney((p.billed ?? 0) - (p.collected ?? 0))}`
              : "金額可以寫 185萬 或 1850000"
          }
        >
          <MoneyLine label="合約金額" value={p.contract} onCommit={(v) => commit({ contract: v })} />
          <MoneyLine label="追加減" value={p.variation} signed onCommit={(v) => commit({ variation: v })} />
          <MoneyLine label="已請款" value={p.billed} onCommit={(v) => commit({ billed: v })} />
          <MoneyLine label="已收款" value={p.collected} onCommit={(v) => commit({ collected: v })} />
        </List>
      )}

      <List title="人員與地點">
        <PickLine label="工程類別" value={p.category ?? p.view.category} options={CATEGORIES} edit={edit} allowEmpty onCommit={(v) => commit({ category: v })} />
        <TextLine label="工地主任" value={p.manager} edit={edit} placeholder="姓名" list={pm.people.map((x) => x.name)} onCommit={(v) => commit({ manager: v })} />
        <TextLine label="業主" value={p.client} edit={edit} placeholder="姓名或公司" onCommit={(v) => commit({ client: v })} />
        <TextLine label="工地地址" value={p.site} edit={edit} placeholder="縣市區＋路名" onCommit={(v) => commit({ site: v })} />
      </List>

      <List title="近況">
        <NoteLine value={p.note} edit={edit} onCommit={(v) => commit({ note: v })} />
      </List>

      {pm.isManager && <EditorsLine pm={pm} p={p} />}

      <List title="雲端資料夾" foot={edit ? "工程照會上傳到這個資料夾裡的「工程照」。沒填的話，第一次上傳時會依代碼自動尋找。" : undefined}>
        {folder && (
          <a href={folder} target="_blank" rel="noreferrer" className="flex items-center gap-3 pl-4 pr-3 h-12 active:bg-[#F2F2F4]">
            <Icon name="folder" fill={1} className="text-[22px]" style={{ color: personColor(p.code) }} />
            <span className="flex-1 text-[16px] text-[#18181B]">打開專案資料夾</span>
            <Icon name="open_in_new" className="text-[18px] text-[#C7C7CC]" />
          </a>
        )}
        {edit ? (
          <TextLine
            label={folder ? "換一個" : "資料夾連結"}
            value={folder}
            edit
            placeholder="貼上 Google Drive 網址"
            onCommit={(v) => {
              const id = v ? folderIdFrom(v) : undefined;
              if (v && !id) {
                toast("看不懂這個雲端資料夾連結", { tone: "error" });
                return Promise.resolve(false);
              }
              return commit({ driveFolderId: id });
            }}
          />
        ) : (
          !folder && <p className="px-4 py-3 text-[14px] text-[#8E8E93]">還沒連結</p>
        )}
      </List>

      {pm.isManager && <DeleteProject pm={pm} p={p} onDone={onDeleted} />}
    </div>
  );
}

/* ── 設定風格的列 ── */

function List({ title, foot, children }: { title?: string; foot?: string; children: React.ReactNode }) {
  return (
    <section>
      {title && <h3 className="px-4 pb-1.5 text-[13px] text-[#8E8E93]">{title}</h3>}
      <div className="bg-white rounded-[14px] overflow-hidden divide-y divide-[#F0F0F2]">{children}</div>
      {foot && <p className="px-4 pt-1.5 text-[12.5px] leading-relaxed text-[#8E8E93]">{foot}</p>}
    </section>
  );
}

const lineCls = "relative flex items-center gap-3 pl-4 pr-3 min-h-[48px]";
const labelCls = "text-[16px] text-[#18181B] shrink-0";
const valueCls = "flex-1 min-w-0 text-right text-[16px] text-[#6E6E73] bg-transparent outline-none placeholder:text-[#C7C7CC] truncate";

/** 文字：右邊直接打字，離開輸入框（或按完成）就存 */
function TextLine({
  label,
  value,
  edit,
  placeholder,
  list,
  onCommit,
}: {
  label: string;
  value?: string;
  edit: boolean;
  placeholder?: string;
  list?: string[];
  onCommit: (v: string | undefined) => Promise<boolean>;
}) {
  const [t, setT] = useState(value ?? "");
  const focused = useRef(false);
  const id = React.useId();
  useEffect(() => {
    if (!focused.current) setT(value ?? "");
  }, [value]);
  if (!edit) {
    return (
      <div className={lineCls}>
        <span className={labelCls}>{label}</span>
        <span className={`${valueCls} ${value ? "" : "!text-[#C7C7CC]"}`}>{value || "未填"}</span>
      </div>
    );
  }
  const done = async () => {
    focused.current = false;
    const v = t.trim() || undefined;
    if ((v ?? "") === (value ?? "")) return;
    if (!(await onCommit(v))) setT(value ?? "");
  };
  return (
    <label className={`${lineCls} cursor-text`}>
      <span className={labelCls}>{label}</span>
      <input
        value={t}
        onChange={(e) => setT(e.target.value)}
        onFocus={() => (focused.current = true)}
        onBlur={done}
        onKeyDown={(e) => e.key === "Enter" && !e.nativeEvent.isComposing && (e.target as HTMLInputElement).blur()}
        placeholder={placeholder}
        enterKeyHint="done"
        autoComplete="off"
        list={list?.length ? id : undefined}
        className={valueCls}
      />
      {list && list.length > 0 && (
        <datalist id={id}>
          {list.map((x) => (
            <option key={x} value={x} />
          ))}
        </datalist>
      )}
    </label>
  );
}

/** 金額：平常顯示「185 萬」，點進去才是數字；追加減左邊有「追加／追減」切換（iOS 數字鍵盤沒有負號） */
function MoneyLine({ label, value, signed, onCommit }: { label: string; value?: number; signed?: boolean; onCommit: (v: number | undefined) => Promise<boolean> }) {
  const [focus, setFocus] = useState(false);
  const [t, setT] = useState("");
  const neg = (value ?? 0) < 0;
  const done = async () => {
    setFocus(false);
    if (t.trim() === "") {
      if (value !== undefined) await onCommit(undefined);
      return;
    }
    const n = parseMoney(t);
    if (n === undefined || n < 0) return toast("看不懂這個金額，例：185萬 或 1850000", { tone: "error" });
    const v = signed && neg ? -n : n;
    if (v !== value) await onCommit(v);
  };
  return (
    <label className={`${lineCls} cursor-text`}>
      <span className={labelCls}>{label}</span>
      {signed && (
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            if (value) onCommit(-value);
          }}
          disabled={!value}
          className="h-7 px-2.5 rounded-full bg-[#F2F2F4] text-[13px] font-semibold text-[#3F3F46] disabled:text-[#C7C7CC]"
          aria-label="切換追加或追減"
        >
          {neg ? "追減" : "追加"}
        </button>
      )}
      <input
        inputMode="decimal"
        value={focus ? t : value === undefined ? "" : fmtMoney(Math.abs(value))}
        onFocus={() => {
          setT(value === undefined ? "" : String(Math.abs(value)));
          setFocus(true);
        }}
        onChange={(e) => setT(e.target.value)}
        onBlur={done}
        onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
        placeholder="未填"
        enterKeyHint="done"
        autoComplete="off"
        className={`${valueCls} tabular-nums`}
      />
    </label>
  );
}

/** 日期：右邊顯示 10/3（六），整列點了叫出系統的日期選擇；有值時右邊有 × 可以清掉 */
function DateLine({
  label,
  value,
  today,
  min,
  edit,
  onCommit,
}: {
  label: string;
  value?: string;
  today: string;
  min?: string;
  edit: boolean;
  onCommit: (v: string | undefined) => Promise<boolean>;
}) {
  return (
    <div className={lineCls}>
      <span className={labelCls}>{label}</span>
      <span className={`flex-1 text-right text-[16px] tabular-nums ${value ? (edit ? "text-[var(--accent-ink)]" : "text-[#6E6E73]") : "text-[#C7C7CC]"}`}>
        {value ? fmtDateLong(value, today) : "未設定"}
      </span>
      {edit && (
        <>
          <input
            type="date"
            value={value ?? ""}
            min={min}
            onChange={(e) => onCommit(e.target.value || undefined)}
            onClick={(e) => {
              try {
                (e.currentTarget as HTMLInputElement & { showPicker?: () => void }).showPicker?.();
              } catch {
                /* 某些瀏覽器不允許 */
              }
            }}
            aria-label={label}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            style={{ colorScheme: "light", right: value ? 44 : 0 }}
          />
          {value && (
            <button type="button" onClick={() => onCommit(undefined)} aria-label={`清除${label}`} className="relative z-[1] -mr-1 w-8 h-8 rounded-full flex items-center justify-center text-[#C7C7CC] active:bg-[#F2F2F4]">
              <Icon name="cancel" fill={1} className="text-[19px]" />
            </button>
          )}
        </>
      )}
    </div>
  );
}

/** 選一個：右邊目前的值 ⌃⌄，點了跳出系統選單（iPhone 是滾輪） */
function PickLine({
  label,
  value,
  options,
  edit,
  allowEmpty,
  onCommit,
}: {
  label: string;
  value?: string;
  options: readonly string[];
  edit: boolean;
  allowEmpty?: boolean;
  onCommit: (v: string | undefined) => Promise<boolean>;
}) {
  return (
    <div className={lineCls}>
      <span className={labelCls}>{label}</span>
      <span className={`flex-1 text-right text-[16px] ${value ? "text-[#6E6E73]" : "text-[#C7C7CC]"}`}>{value ?? "未設定"}</span>
      {edit && (
        <>
          <Icon name="unfold_more" className="text-[18px] text-[#C7C7CC] -ml-1.5" />
          <select
            value={value ?? ""}
            onChange={(e) => onCommit(e.target.value || undefined)}
            aria-label={label}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          >
            {(allowEmpty || !value) && <option value="">未設定</option>}
            {options.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        </>
      )}
    </div>
  );
}

/** 進度：預設依任務自動算；點開可以手動調（－／＋ 5%、滑桿），也可以改回自動 */
function ProgressLine({ value, auto, edit, onCommit }: { value?: number; auto?: number; edit: boolean; onCommit: (v: number | undefined) => Promise<boolean> }) {
  const [open, setOpen] = useState(false);
  const [v, setV] = useState(value ?? auto ?? 0);
  useEffect(() => setV(value ?? auto ?? 0), [value, auto]);
  const manual = value !== undefined;
  const set = (n: number) => setV(Math.max(0, Math.min(100, Math.round(n))));
  return (
    <div>
      <button type="button" disabled={!edit} onClick={() => setOpen((o) => !o)} className={`${lineCls} w-full text-left active:bg-[#F2F2F4] disabled:active:bg-transparent`} aria-expanded={open}>
        <span className={labelCls}>進度</span>
        <span className="flex-1 text-right text-[16px] text-[#6E6E73] tabular-nums">
          {value ?? auto ?? 0}%<span className="ml-1.5 text-[13px] text-[#A1A1AA]">{manual ? "手動" : "依任務"}</span>
        </span>
        {edit && <Icon name={open ? "expand_less" : "expand_more"} className="text-[20px] text-[#C7C7CC] -ml-1" />}
      </button>
      {open && edit && (
        <div className="px-4 pb-3.5">
          <div className="flex items-center gap-3">
            <button type="button" onClick={() => set(v - 5)} className="w-10 h-10 rounded-full bg-[#F2F2F4] flex items-center justify-center active:bg-[#E4E4E7]" aria-label="減少 5%">
              <Icon name="remove" className="text-[20px]" />
            </button>
            <input type="range" min={0} max={100} step={5} value={v} onChange={(e) => set(+e.target.value)} className="flex-1 accent-[var(--accent)] h-6" aria-label="進度" />
            <button type="button" onClick={() => set(v + 5)} className="w-10 h-10 rounded-full bg-[#F2F2F4] flex items-center justify-center active:bg-[#E4E4E7]" aria-label="增加 5%">
              <Icon name="add" className="text-[20px]" />
            </button>
          </div>
          <div className="flex gap-2 mt-3">
            {manual && auto !== undefined && (
              <button
                type="button"
                onClick={async () => {
                  if (await onCommit(undefined)) setOpen(false);
                }}
                className="flex-1 h-10 rounded-[12px] bg-[#F2F2F4] text-[14px] font-semibold text-[#3F3F46]"
              >
                改回依任務 {auto}%
              </button>
            )}
            <button
              type="button"
              disabled={v === (value ?? auto ?? 0) && manual}
              onClick={async () => {
                if (await onCommit(v)) setOpen(false);
              }}
              className="flex-1 h-10 rounded-[12px] bg-[#18181B] text-white text-[14px] font-semibold disabled:opacity-35"
            >
              設為 {v}%
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/** 近況：整塊文字框，離開就存 */
function NoteLine({ value, edit, onCommit }: { value?: string; edit: boolean; onCommit: (v: string | undefined) => Promise<boolean> }) {
  const [t, setT] = useState(value ?? "");
  const focused = useRef(false);
  useEffect(() => {
    if (!focused.current) setT(value ?? "");
  }, [value]);
  if (!edit) return <p className={`px-4 py-3 text-[15px] leading-relaxed whitespace-pre-wrap ${value ? "text-[#18181B]" : "text-[#C7C7CC]"}`}>{value || "還沒有寫"}</p>;
  return (
    <textarea
      value={t}
      onChange={(e) => setT(e.target.value)}
      onFocus={() => (focused.current = true)}
      onBlur={async () => {
        focused.current = false;
        const v = t.trim() || undefined;
        if ((v ?? "") !== (value ?? "") && !(await onCommit(v))) setT(value ?? "");
      }}
      placeholder="例：泥作打底完成，待乾燥後上面層"
      rows={3}
      className="block w-full px-4 py-3 bg-transparent text-[16px] leading-relaxed text-[#18181B] outline-none resize-none placeholder:text-[#C7C7CC]"
    />
  );
}

/** 可以編輯的人：點開是頭像，點一下勾選／取消，馬上存 */
function EditorsLine({ pm, p }: { pm: Pm; p: ProjectItem }) {
  const [open, setOpen] = useState(false);
  const editors = p.editors ?? [];
  const names = editors.map((e) => pm.personBy.get(e)?.name ?? e.split("@")[0]);
  const toggle = (email: string) => {
    const next = editors.includes(email) ? editors.filter((e) => e !== email) : [...editors, email];
    pm.saveEditors(p.code, next);
  };
  return (
    <List title="權限" foot="勾選的人可以調整這個專案的甘特圖排程，也能修改、指派這個專案的任務。管理者本來就可以。">
      <button type="button" onClick={() => setOpen((o) => !o)} className={`${lineCls} w-full text-left active:bg-[#F2F2F4]`} aria-expanded={open}>
        <span className={labelCls}>可以編輯的人</span>
        <span className={`flex-1 min-w-0 text-right text-[16px] truncate ${names.length ? "text-[#6E6E73]" : "text-[#C7C7CC]"}`}>{names.length ? names.join("、") : "只有管理者"}</span>
        <Icon name={open ? "expand_less" : "expand_more"} className="text-[20px] text-[#C7C7CC] -ml-1" />
      </button>
      {open && (
        <div className="px-3 py-3 grid grid-cols-4 sm:grid-cols-6 gap-y-3 gap-x-1" role="group" aria-label="可以編輯的人">
          {pm.people
            .filter((x) => !x.manager)
            .map((x) => {
              const on = editors.includes(x.email);
              return (
                <button key={x.email} type="button" role="checkbox" aria-checked={on} onClick={() => toggle(x.email)} className="flex flex-col items-center gap-1 min-w-0 active:scale-95 transition-transform">
                  <span className="relative rounded-full p-[3px]" style={{ background: on ? "var(--accent)" : "transparent" }}>
                    <span className="block rounded-full ring-2 ring-white">
                      <Avatar name={x.name} email={x.email} size={44} />
                    </span>
                    {on && (
                      <span className="absolute -right-0.5 -bottom-0.5 w-5 h-5 rounded-full border-2 border-white flex items-center justify-center bg-[var(--accent)]">
                        <Icon name="check" weight={700} className="text-[13px] text-white" />
                      </span>
                    )}
                  </span>
                  <span className={`text-[12px] leading-tight truncate max-w-full ${on ? "font-bold text-[#18181B]" : "text-[#52525B]"}`}>{x.name}</span>
                </button>
              );
            })}
        </div>
      )}
    </List>
  );
}

/* ── 照片（只看；上傳從底部「＋」） ─────────────────────── */

const photoFetcher = async (url: string): Promise<PmPhoto[]> => {
  const r = await fetch(url, { cache: "no-store" });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error || "讀不到照片");
  return j.items;
};

function Photos({ pm, project }: { pm: Pm; project: ProjectItem }) {
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
      {folder && (
        <a href={folder} target="_blank" rel="noreferrer" className="self-start h-9 px-3.5 rounded-full bg-white text-[14px] font-semibold text-[#18181B] inline-flex items-center gap-1.5 active:bg-[#F2F2F4]">
          <Icon name="folder_open" className="text-[18px]" />
          雲端資料夾
        </a>
      )}
      {isLoading && !data ? (
        <div className="flex justify-center py-10">
          <Spinner size={20} />
        </div>
      ) : error ? (
        <p className="text-[14px] text-[#71717A]">{String(error.message)}</p>
      ) : !data?.length ? (
        <Group>
          <Empty icon="photo_camera" title="還沒有工程照" hint="用畫面底部的「＋」拍照上傳，照片會自動放進這個專案雲端資料夾的「工程照」。" />
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
