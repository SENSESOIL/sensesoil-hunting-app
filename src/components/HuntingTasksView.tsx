"use client";

import React, { useState, useRef, useEffect, forwardRef, useImperativeHandle } from "react";
import { createPortal } from "react-dom";
import { DragDropContext, Droppable, Draggable } from "@hello-pangea/dnd";
import { useHuntingTasks, WeekRecord, Status } from "@/hooks/useHuntingTasks";

// --- Helpers ---
const StatusIcon = ({ status, onClick }: { status: Status; onClick?: () => void }) => {
  const baseClasses = `w-6 h-6 flex items-center justify-center shrink-0 transition-colors ${onClick ? 'cursor-pointer' : 'cursor-default'}`;
  
  if (status === "done") {
    return (
      <div onClick={onClick} className={`${baseClasses} group`}>
        <span className="material-symbols-outlined text-[20px] text-[#F39C12] group-hover:opacity-80" style={{ fontVariationSettings: "'FILL' 1, 'wght' 300" }}>check_circle</span>
      </div>
    );
  }
  if (status === "partial") {
    return (
      <div onClick={onClick} className={`${baseClasses} group`}>
        <span className="material-symbols-outlined text-[20px] text-[#F39C12] group-hover:opacity-80" style={{ fontVariationSettings: "'wght' 300" }}>change_history</span>
      </div>
    );
  }
  if (status === "fail") {
    return (
      <div onClick={onClick} className={`${baseClasses} group`}>
        <span className="material-symbols-outlined text-[20px] text-[#F39C12] group-hover:opacity-80" style={{ fontVariationSettings: "'wght' 300" }}>close</span>
      </div>
    );
  }
  return (
    <div onClick={onClick} className={`${baseClasses} group`}>
      <span className="material-symbols-outlined text-[20px] text-[#E4E4E7] group-hover:text-[#A1A1AA]" style={{ fontVariationSettings: "'wght' 300" }}>radio_button_unchecked</span>
    </div>
  );
};

export interface HuntingTasksViewRef {
  getShareText: () => string;
}

const HuntingTasksView = forwardRef<HuntingTasksViewRef, {}>((props, ref) => {
  const { 
    hunterName,
    weeks, 
    actualCurrentWeekIndex, 
    isLoading, 
    toggleStatus, 
    updateText, 
    addTask, 
    addSubtask, 
    deleteTask, 
    reorderSubtasks,
    populateDefaultTasks,
    copyFromPreviousWeek
  } = useHuntingTasks();

  const [currentWeekIndex, setCurrentWeekIndex] = useState(actualCurrentWeekIndex);
  const [isMounted, setIsMounted] = useState(false);
  const [highlightUnfinished, setHighlightUnfinished] = useState(false);
  const [unwrittenNextWeekTasks, setUnwrittenNextWeekTasks] = useState<string[]>([]);
  
  // State to track which item is being edited: { weekId, taskId, subId? }
  const [editingTarget, setEditingTarget] = useState<{ weekId: string; taskId: string; subId?: string } | null>(null);
  const [editingText, setEditingText] = useState("");
  const [showDuplicateMenu, setShowDuplicateMenu] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  // Update currentWeekIndex if actualCurrentWeekIndex changes (e.g. hydration complete)
  useEffect(() => {
    if (weeks.length > 0 && currentWeekIndex === -1) {
      setCurrentWeekIndex(actualCurrentWeekIndex);
    }
  }, [actualCurrentWeekIndex, currentWeekIndex, weeks.length]);

  const thisWeekId = weeks[actualCurrentWeekIndex]?.id;
  const nextWeekId = weeks[actualCurrentWeekIndex + 1]?.id || 'empty';
  const weekAfterNextId = weeks[actualCurrentWeekIndex + 2]?.id || 'empty2';

  // Auto-populate default tasks for current, next week, and week after next if they are completely empty
  useEffect(() => {
    if (isLoading || !hunterName) return; // Wait until data and user identity are loaded
    
    // Only auto-populate the active weeks the user can edit
    const checkAndPopulate = async () => {
      const thisWeek = weeks.find(w => w.id === thisWeekId);
      const nextWeek = weeks.find(w => w.id === nextWeekId);
      const weekAfterNext = weeks.find(w => w.id === weekAfterNextId);
      
      if (thisWeek && thisWeek.tasks.length === 0) {
        await populateDefaultTasks(thisWeekId);
      }
      if (nextWeek && nextWeek.tasks.length === 0 && nextWeekId !== 'empty') {
        await populateDefaultTasks(nextWeekId);
      }
      if (weekAfterNext && weekAfterNext.tasks.length === 0 && weekAfterNextId !== 'empty2') {
        await populateDefaultTasks(weekAfterNextId);
      }
    };
    checkAndPopulate();
  }, [weeks, thisWeekId, nextWeekId, weekAfterNextId, isLoading, hunterName, populateDefaultTasks]);

  // Focus input automatically when editing starts
  useEffect(() => {
    if (editingTarget && inputRef.current) {
      inputRef.current.focus();
    }
  }, [editingTarget]);

  useImperativeHandle(ref, () => ({
    getShareText: () => {
      const thisWeek = weeks.find(w => w.id === thisWeekId);
      const nextWeek = weeks.find(w => w.id === nextWeekId);

      if (thisWeek) {
        const hasUnfinished = thisWeek.tasks.some(t => t.status === 'todo' || t.subs.some(s => s.status === 'todo'));
        if (hasUnfinished) {
          setHighlightUnfinished(true);
          if (actualCurrentWeekIndex !== currentWeekIndex) setCurrentWeekIndex(actualCurrentWeekIndex);
          throw new Error("本週尚有未紀錄完成度的任務，請先點選確認後再進行匯出！");
        }
      }
      setHighlightUnfinished(false);

      if (nextWeek) {
        const defaultTexts = ["新任務", "新任務", "新任務", "體能", "格局"];
        const invalidTaskIds: string[] = [];
        const formatErrorIds: string[] = [];
        
        nextWeek.tasks.forEach((t, index) => {
          const defaultText = defaultTexts[index] || "新任務";
          const isMainUnchanged = t.text.trim() === defaultText || t.text.trim() === '';
          const hasNoValidSubs = t.subs.length === 0 || t.subs.every(s => s.text.trim() === '' || s.text === '新子任務');
          
          let isUnwritten = isMainUnchanged && hasNoValidSubs;
          let hasFormatError = false;

          if (index === 4 && !isUnwritten) {
            const validateVisionText = (text: string) => {
              const hasAction = /[讀聽看練]/.test(text);
              const hasRange = /[章頁集次篇堂首部%成半剩天]|p\.|分之|\d\/\d/i.test(text);
              return hasAction && hasRange;
            };

            if (t.subs.length === 0) {
              if (!validateVisionText(t.text)) hasFormatError = true;
            } else {
              const hasValidSub = t.subs.some(s => {
                if (s.text.trim() === '' || s.text === '新子任務') return false;
                return validateVisionText(`${t.text} ${s.text}`);
              });
              if (!hasValidSub) hasFormatError = true;
            }
          }
          
          if (isUnwritten) {
            invalidTaskIds.push(t.id);
          } else if (hasFormatError) {
            formatErrorIds.push(t.id);
          }
        });

        if (invalidTaskIds.length > 0 || formatErrorIds.length > 0) {
          setUnwrittenNextWeekTasks([...invalidTaskIds, ...formatErrorIds]);
          if (actualCurrentWeekIndex !== currentWeekIndex) setCurrentWeekIndex(actualCurrentWeekIndex); 
          
          if (formatErrorIds.length > 0) {
            throw new Error("下週第5項「格局」任務不完整！\n\n請確保任務明確包含：\n\n1. 行動 (讀 / 聽 / 看 / 練)\n2. 項目 \n3. 目標 (頁 / 集 / 章 / 次 / 天 / 比例)\n\n範例：讀《當責思維》第一章");
          } else {
            throw new Error("下週任務尚有未填寫的項目，請填寫完畢後再進行匯出！");
          }
        }
      }
      setUnwrittenNextWeekTasks([]);

      const formatTaskStatus = (status: Status) => {
        if (status === 'done') return '✅ ';
        if (status === 'partial') return '🔼 ';
        if (status === 'fail') return '❌ ';
        return '';
      };

      const formatWeek = (w: WeekRecord | undefined, title: string) => {
        if (!w) return '';
        let text = `${title} 【狩獵任務】\n`;
        w.tasks.forEach((t, i) => {
          text += `${formatTaskStatus(t.status)}${i + 1}. ${t.text}\n`;
          t.subs.forEach(s => {
            text += `${formatTaskStatus(s.status)}- ${s.text}\n`;
          });
        });
        return text;
      };

      return `${formatWeek(thisWeek, '本週')}\n${formatWeek(nextWeek, '下週')}`.trim();
    }
  }));

  const handlePrevWeek = () => {
    setCurrentWeekIndex((prev) => Math.max(0, prev - 1));
  };

  const handleNextWeek = () => {
    setCurrentWeekIndex((prev) => Math.min(weeks.length - 2, prev + 1));
  };

  const startEditing = (weekId: string, taskId: string, subId?: string, text: string = "") => {
    if (weekId !== thisWeekId && weekId !== nextWeekId && weekId !== weekAfterNextId) return;
    setUnwrittenNextWeekTasks([]);
    setEditingTarget({ weekId, taskId, subId });
    const initialText = (text === "新任務" || text === "新子任務") ? "" : text;
    setEditingText(initialText);
  };

  const saveEdit = () => {
    if (!editingTarget) return;
    const { weekId, taskId, subId } = editingTarget;
    
    let finalText = editingText.trim();
    if (finalText === "") {
      if (!subId) {
        const week = weeks.find(w => w.id === weekId);
        const taskIndex = week?.tasks.findIndex(t => t.id === taskId);
        const defaultTexts = ["新任務", "新任務", "新任務", "體能", "格局"];
        finalText = (taskIndex !== undefined && taskIndex >= 0 && taskIndex < 5) ? defaultTexts[taskIndex] : "新任務";
      } else {
        finalText = "新子任務";
      }
    }
    
    updateText(subId || taskId, finalText);
    setEditingTarget(null);
  };

  const onDragEnd = (result: any) => {
    const { source, destination } = result;
    if (!destination) return;
    if (source.droppableId === destination.droppableId && source.index === destination.index) return;

    const [sourceWeekId, sourceTaskId] = source.droppableId.split("::");
    const [destWeekId, destTaskId] = destination.droppableId.split("::");

    if (sourceWeekId !== thisWeekId && sourceWeekId !== nextWeekId && sourceWeekId !== weekAfterNextId) return;
    if (destWeekId !== thisWeekId && destWeekId !== nextWeekId && destWeekId !== weekAfterNextId) return;

    reorderSubtasks(sourceTaskId, destTaskId, source.index, destination.index);
  };

  const getTitlePrefix = (weekId: string) => {
    if (weekId === thisWeekId) return "本週任務";
    if (weekId === nextWeekId) return "下週任務";
    if (weekId === weekAfterNextId) return "下下週任務";
    if (weekId === weeks[actualCurrentWeekIndex - 1]?.id) return "上週任務";
    return "歷史任務";
  };

  const handleAddSubtask = async (weekId: string, taskId: string) => {
    const sub = await addSubtask(weekId, taskId);
    if (sub) {
      startEditing(weekId, taskId, sub.id, sub.text);
    }
  };

  const handleAddTask = async (weekId: string) => {
    const task = await addTask(weekId);
    if (task) {
      startEditing(weekId, task.id, undefined, task.text);
    }
  };

  const currentWeek = weeks[currentWeekIndex] || { id: 'empty', label: '', tasks: [] };
  const nextWeek = weeks[currentWeekIndex + 1] || { id: 'empty2', label: '', tasks: [] };

  const renderCard = (week: WeekRecord, isRightCard: boolean = false) => {
    const titlePrefix = getTitlePrefix(week.id);
    const isThisWeek = titlePrefix === "本週任務";
    const isNextWeek = titlePrefix === "下週任務";
    const isWeekAfterNext = titlePrefix === "下下週任務";
    const isGreyStyle = !isThisWeek;
    
    const weekIndex = weeks.findIndex(w => w.id === week.id);
    const previousWeekId = weekIndex > 0 ? weeks[weekIndex - 1]?.id : undefined;
    
    const isContentLocked = !isThisWeek && !isNextWeek && !isWeekAfterNext;

    const totalDone = week.tasks.filter(t => t.status === "done").length;
    const totalPartial = week.tasks.filter(t => t.status === "partial").length;
    const totalFail = week.tasks.filter(t => t.status === "fail").length;
    const totalTodo = week.tasks.filter(t => t.status === "todo").length;

    return (
      <div className="bg-[#FFFFFF] p-6 rounded-[24px] border border-[#E4E4E7] shadow-[0_2px_10px_rgba(0,0,0,0.02)] flex flex-col h-full relative">
        {isLoading && (
          <div className="absolute inset-0 bg-white/50 backdrop-blur-[2px] z-10 rounded-[24px] flex items-center justify-center">
             <div className="w-6 h-6 border-2 border-[#F39C12] border-t-transparent rounded-full animate-spin"></div>
          </div>
        )}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2.5">
            <h3 className="font-semibold text-[17px] text-[#18181B] flex items-center">
              <span>{titlePrefix}</span>
              <span className="hidden md:inline">【狩獵任務】</span>
            </h3>
          </div>
          
          <div className="flex items-center gap-2">
            {!isRightCard && (
               <button onClick={handlePrevWeek} disabled={currentWeekIndex === 0} className="w-6 h-6 flex items-center justify-center rounded-full hover:bg-[#F4F4F5] disabled:opacity-30 disabled:hover:bg-transparent text-[#71717A]">
                 <span className="material-symbols-outlined text-[16px]">chevron_left</span>
               </button>
            )}
            <span className="text-[10px] font-bold tracking-widest text-[#A1A1AA] uppercase">{week.label}</span>
            {!isRightCard && (
               <button onClick={handleNextWeek} disabled={currentWeekIndex >= weeks.length - 2} className="w-6 h-6 flex items-center justify-center rounded-full hover:bg-[#F4F4F5] disabled:opacity-30 disabled:hover:bg-transparent text-[#71717A]">
                 <span className="material-symbols-outlined text-[16px]">chevron_right</span>
               </button>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-0.5 flex-1">
          {week.tasks.map((task, idx) => {
            const isEditingMain = editingTarget?.weekId === week.id && editingTarget?.taskId === task.id && !editingTarget?.subId;
            return (
              <div key={task.id} className="group flex flex-col mb-0.5">
                {/* Main Task Row */}
                <div className={`flex items-center py-1.5 px-1 rounded-[14px] transition-colors relative ${(highlightUnfinished && isThisWeek && task.status === 'todo') || (isNextWeek && unwrittenNextWeekTasks.includes(task.id)) ? 'bg-red-50 border border-red-200' : isContentLocked ? '' : 'hover:bg-[#FAFAFA]'}`}>
                  <div className="mr-2">
                    <StatusIcon status={task.status} onClick={(!isContentLocked) && task.subs.length === 0 ? () => toggleStatus(week.id, task.id) : undefined} />
                  </div>
                  <div className="text-[12px] font-bold text-[#A1A1AA] w-4 shrink-0 mt-0.5">{idx + 1}.</div>
                  
                  {isEditingMain ? (
                    <input
                      ref={inputRef}
                      value={editingText}
                      onChange={(e) => setEditingText(e.target.value)}
                      onBlur={saveEdit}
                      onKeyDown={(e) => e.key === 'Enter' && saveEdit()}
                      className="flex-1 bg-transparent text-[16px] md:text-[14px] font-semibold text-[#18181B] outline-none border-0 border-b border-[#F39C12] focus:ring-0 focus:border-[#F39C12] ml-1 p-0"
                    />
                  ) : (
                    <div 
                      className={`flex-1 text-[14px] font-semibold text-[#18181B] leading-snug ml-1 min-h-[20px] ${isContentLocked ? 'cursor-default' : 'cursor-text'}`}
                      onClick={() => !isContentLocked && startEditing(week.id, task.id, undefined, task.text)}
                    >
                      {task.text.trim() === "" ? (idx < 5 ? ["新任務", "新任務", "新任務", "體能", "格局"][idx] : "新任務") : task.text}
                    </div>
                  )}

                  {/* Actions Group (Hover) */}
                  {!isContentLocked && (
                    <div className="opacity-100 md:opacity-0 md:group-hover:opacity-100 flex items-center absolute right-2 top-1/2 -translate-y-1/2 transition-opacity gap-1">
                    <button 
                      onClick={() => handleAddSubtask(week.id, task.id)}
                      className="w-6 h-6 flex items-center justify-center rounded-full hover:bg-[#E4E4E7] text-[#A1A1AA] transition-colors"
                      title="新增子任務"
                    >
                      <span className="material-symbols-outlined translate-y-[-1px]" style={{ fontSize: '11px' }}>add</span>
                    </button>
                    {idx >= 5 && (
                      <button 
                        onClick={() => deleteTask(task.id)}
                        className="w-6 h-6 flex items-center justify-center rounded-full hover:bg-red-50 text-[#A1A1AA] hover:text-red-500 transition-colors"
                        title="刪除任務"
                      >
                        <span className="material-symbols-outlined translate-y-[-1px]" style={{ fontSize: '11px' }}>remove</span>
                      </button>
                    )}
                  </div>
                  )}
                </div>

                {/* Subtasks - Droppable Area */}
                <Droppable droppableId={`${week.id}::${task.id}`} type="subtask">
                  {(provided) => (
                    <div 
                      className={`flex flex-col gap-0 pb-0.5 mt-0.5 relative`}
                      ref={provided.innerRef}
                      {...provided.droppableProps}
                      style={{ minHeight: task.subs.length === 0 ? '10px' : 'auto' }}
                    >
                      {task.subs.map((sub, index) => {
                        const isEditingSub = editingTarget?.weekId === week.id && editingTarget?.taskId === task.id && editingTarget?.subId === sub.id;
                        return (
                          <Draggable key={sub.id} draggableId={sub.id} index={index}>
                            {(provided, snapshot) => (
                              <div 
                                ref={provided.innerRef}
                                {...provided.draggableProps}
                                className={`relative flex items-center py-1 px-1 rounded-[10px] transition-colors group/sub ${snapshot.isDragging ? 'bg-[#FFFFFF] shadow-[0_8px_30px_rgba(0,0,0,0.12)] border border-[#E4E4E7] z-50' : highlightUnfinished && isThisWeek && sub.status === 'todo' ? 'bg-red-50 border border-red-200' : 'hover:bg-[#FAFAFA]'}`}
                              >
                                <div 
                                  {...provided.dragHandleProps}
                                  className="w-6 h-6 mr-1 opacity-100 md:opacity-0 md:group-hover/sub:opacity-100 cursor-grab active:cursor-grabbing text-[#A1A1AA] hover:text-[#F39C12] transition-colors flex items-center justify-center shrink-0"
                                >
                                  <span className="material-symbols-outlined text-[16px]">drag_indicator</span>
                                </div>
                                <div className="-ml-1 mr-1 scale-75 shrink-0 flex items-center justify-center">
                                  <StatusIcon status={sub.status} onClick={!isContentLocked ? () => toggleStatus(week.id, task.id, sub.id) : undefined} />
                                </div>
                                {isEditingSub ? (
                                  <input
                                    ref={inputRef}
                                    value={editingText}
                                    onChange={(e) => setEditingText(e.target.value)}
                                    onBlur={saveEdit}
                                    onKeyDown={(e) => e.key === 'Enter' && saveEdit()}
                                    className="flex-1 bg-transparent text-[16px] md:text-[13px] font-normal text-[#71717A] outline-none border-0 border-b border-[#F39C12] focus:ring-0 focus:border-[#F39C12] p-0"
                                  />
                                ) : (
                                  <div 
                                    className={`flex-1 text-[13px] text-[#71717A] font-medium leading-snug min-h-[18px] ${isContentLocked ? 'cursor-default' : 'cursor-text'}`}
                                    onClick={() => !isContentLocked && startEditing(week.id, task.id, sub.id, sub.text)}
                                  >
                                    {sub.text.trim() === "" ? "新子任務" : sub.text}
                                  </div>
                                )}
                                {/* Delete Subtask Button (Hover) */}
                                {!isContentLocked && (
                                  <button 
                                    onClick={() => deleteTask(sub.id)}
                                  className="opacity-100 md:opacity-0 md:group-hover/sub:opacity-100 w-6 h-6 flex items-center justify-center rounded-full hover:bg-red-50 text-[#A1A1AA] hover:text-red-500 transition-colors absolute right-2 top-1/2 -translate-y-1/2"
                                  title="刪除子任務"
                                >
                                  <span className="material-symbols-outlined translate-y-[-1px]" style={{ fontSize: '11px' }}>remove</span>
                                </button>
                                )}
                              </div>
                            )}
                          </Draggable>
                        );
                      })}
                      {provided.placeholder}
                    </div>
                  )}
                </Droppable>
              </div>
            );
          })}
          {!isContentLocked && (
            <button 
              onClick={() => handleAddTask(week.id)}
              className="mt-2 w-full py-2.5 rounded-[12px] border border-dashed border-[#E4E4E7] text-[12px] font-semibold text-[#A1A1AA] hover:text-[#18181B] hover:border-[#A1A1AA] hover:bg-[#FAFAFA] transition-all flex items-center justify-center gap-1.5 outline-none"
            >
              <span className="material-symbols-outlined translate-y-[-1px]" style={{ fontVariationSettings: "'wght' 200", fontSize: '11px' }}>add</span>
              新增主任務
            </button>
          )}
        </div>

        {/* Minimalist Summary Bar */}
        <div className="mt-6 pt-5 border-t border-[#E4E4E7]/60 flex items-center gap-5 pl-2">
          <div className="flex items-center gap-1.5">
            <span className="text-[13px] font-bold text-[#F39C12]">{totalDone}</span>
            <span className="text-[10px] font-bold tracking-widest text-[#A1A1AA] uppercase">完成</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-[13px] font-bold text-[#18181B]">{totalPartial}</span>
            <span className="text-[10px] font-bold tracking-widest text-[#A1A1AA] uppercase">部分</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-[13px] font-bold text-[#18181B]">{totalFail}</span>
            <span className="text-[10px] font-bold tracking-widest text-[#A1A1AA] uppercase">未達</span>
          </div>
           <div className="flex items-center gap-1.5">
            <span className="text-[13px] font-bold text-[#A1A1AA]">{totalTodo}</span>
            <span className="text-[10px] font-bold tracking-widest text-[#A1A1AA] uppercase">待辦</span>
          </div>

          {(isNextWeek || isWeekAfterNext) && !isContentLocked && previousWeekId && (
            <div className="ml-auto relative">
              <button
                onClick={() => setShowDuplicateMenu(!showDuplicateMenu)}
                className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-[#F4F4F5] text-[#A1A1AA] hover:text-[#18181B] transition-all outline-none"
                title="複製上週任務"
              >
                <span className="material-symbols-outlined text-[16px]" style={{ fontVariationSettings: "'wght' 200, 'FILL' 0" }}>content_copy</span>
              </button>
              {showDuplicateMenu && (
                <>
                  {/* Desktop Popover */}
                  <div className="hidden md:block">
                    <div className="fixed inset-0 z-40" onClick={() => setShowDuplicateMenu(false)} />
                    <div className="absolute bottom-[calc(100%+8px)] right-0 w-40 bg-white rounded-2xl shadow-[0_8px_30px_rgba(0,0,0,0.08)] border border-[#E4E4E7] py-2 z-50 overflow-hidden">
                      <button
                        onClick={() => {
                          setShowDuplicateMenu(false);
                          copyFromPreviousWeek(previousWeekId, week.id, false);
                        }}
                        className="w-full px-4 py-2.5 text-left text-[13px] font-medium text-[#18181B] hover:bg-[#FAFAFA] flex items-center gap-3 transition-colors outline-none focus-visible:bg-[#FAFAFA]"
                      >
                        <span className="material-symbols-outlined text-[18px] text-[#A1A1AA]" style={{ fontVariationSettings: "'wght' 200" }}>format_list_bulleted</span>
                        複製主任務
                      </button>
                      <button
                        onClick={() => {
                          setShowDuplicateMenu(false);
                          copyFromPreviousWeek(previousWeekId, week.id, true);
                        }}
                        className="w-full px-4 py-2.5 text-left text-[13px] font-medium text-[#18181B] hover:bg-[#FAFAFA] flex items-center gap-3 transition-colors outline-none focus-visible:bg-[#FAFAFA]"
                      >
                        <span className="material-symbols-outlined text-[18px] text-[#A1A1AA]" style={{ fontVariationSettings: "'wght' 200" }}>subject</span>
                        複製全任務
                      </button>
                    </div>
                  </div>

                  {/* Mobile Bottom Sheet */}
                  {typeof document !== 'undefined' && createPortal(
                    <div className="fixed inset-0 z-[100] md:hidden flex flex-col justify-end">
                      <div 
                        className="absolute inset-0 bg-[#000000]/20 backdrop-blur-[2px] transition-opacity"
                        onClick={(e) => { e.stopPropagation(); setShowDuplicateMenu(false); }}
                      ></div>
                      <div 
                        className="relative bg-[#F4F4F5] rounded-t-3xl shadow-xl flex flex-col px-6 pt-6 pb-8 transform transition-transform"
                        style={{ animation: 'slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards' }}
                      >
                        <div className="w-12 h-1.5 bg-[#E4E4E7] rounded-full mx-auto mb-6"></div>
                        
                        <div className="flex flex-col gap-3">
                          <button 
                            onClick={() => {
                              setShowDuplicateMenu(false);
                              copyFromPreviousWeek(previousWeekId, week.id, false);
                            }}
                            className="w-full bg-white rounded-2xl p-4 flex items-center gap-4 text-base font-semibold text-[#18181B] active:scale-[0.98] transition-transform outline-none"
                          >
                            <span className="material-symbols-outlined text-[24px] text-[#A1A1AA]" style={{ fontVariationSettings: "'wght' 200" }}>format_list_bulleted</span>
                            複製主任務
                          </button>
                          <button 
                            onClick={() => {
                              setShowDuplicateMenu(false);
                              copyFromPreviousWeek(previousWeekId, week.id, true);
                            }}
                            className="w-full bg-white rounded-2xl p-4 flex items-center gap-4 text-base font-semibold text-[#18181B] active:scale-[0.98] transition-transform outline-none"
                          >
                            <span className="material-symbols-outlined text-[24px] text-[#A1A1AA]" style={{ fontVariationSettings: "'wght' 200" }}>subject</span>
                            複製全任務
                          </button>
                        </div>
                      </div>
                    </div>,
                    document.body
                  )}
                </>
              )}
            </div>
          )}
        </div>
      </div>
    );
  };

  if (!isMounted) return <div className="flex flex-col h-full min-h-screen"></div>;

  return (
    <DragDropContext onDragEnd={onDragEnd}>
      <div className="flex flex-col h-full overflow-hidden">
        <div className="flex-1 min-h-0 overflow-y-auto px-6 lg:px-10 pb-10 custom-scrollbar">
          <div className="w-full h-full">
            <div className="flex flex-col md:flex-row gap-6 md:h-[calc(100vh-220px)]">
              {/* Left Card */}
              <div className="w-full md:w-1/2 flex-1 md:overflow-y-auto hide-scrollbar flex flex-col">
                {renderCard(currentWeek, false)}
                <div className="h-10 shrink-0 md:block hidden"></div>
              </div>
              
              {/* Right Card */}
              <div className="w-full md:w-1/2 flex-1 md:overflow-y-auto hide-scrollbar flex flex-col">
                {renderCard(nextWeek, true)}
                <div className="h-10 shrink-0 md:block hidden"></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </DragDropContext>
  );
});

HuntingTasksView.displayName = 'HuntingTasksView';
export default HuntingTasksView;
