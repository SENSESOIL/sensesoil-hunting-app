import React, { useState, useCallback, useMemo, useRef } from 'react';
import useSWR from 'swr';
import { supabase } from '@/lib/supabase';
import { useSession } from "next-auth/react";

// --- Types ---
export type Status = "todo" | "done" | "partial" | "fail";

export interface SubTask {
  id: string;
  text: string;
  status: Status;
}

export interface Task {
  id: string;
  text: string;
  status: Status;
  subs: SubTask[];
  order_index: number;
}

export interface WeekRecord {
  id: string;
  label: string;
  tasks: Task[];
}

export interface DBTask {
  id: string;
  week_id: string;
  hunter_name: string;
  parent_id: string | null;
  text: string;
  status: Status;
  order_index: number;
}

// --- Helpers ---
const cycleStatus = (current: Status): Status => {
  const flow: Status[] = ["todo", "done", "partial", "fail"];
  const nextIdx = (flow.indexOf(current) + 1) % flow.length;
  return flow[nextIdx];
};

const calculateMainStatus = (subs: SubTask[], currentStatus: Status): Status => {
  if (subs.length === 0) return currentStatus;
  const allDone = subs.every(s => s.status === 'done');
  const allFail = subs.every(s => s.status === 'fail');
  const allTodo = subs.every(s => s.status === 'todo');

  if (allDone) return 'done';
  if (allFail) return 'fail';
  if (allTodo) return 'todo';
  return 'partial';
};

function getISOWeekNumber(date: Date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}

const generateEmptyWeeks = (centerDate: Date, countPast = 5, countFuture = 2): WeekRecord[] => {
  const day = centerDate.getDay();
  const diff = centerDate.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(centerDate.setDate(diff));
  monday.setHours(0, 0, 0, 0);

  const weeks: WeekRecord[] = [];
  for (let i = -countPast; i <= countFuture; i++) {
    const wMonday = new Date(monday);
    wMonday.setDate(monday.getDate() + i * 7);
    const wSaturday = new Date(wMonday);
    wSaturday.setDate(wMonday.getDate() + 5);

    const weekNum = getISOWeekNumber(wMonday);
    const id = `w${weekNum}`;
    const label = `W${weekNum} · ${wMonday.getMonth() + 1}/${wMonday.getDate()} - ${wSaturday.getMonth() + 1}/${wSaturday.getDate()}`;

    weeks.push({ id, label, tasks: [] });
  }
  return weeks;
};

// --- Hook ---
export function useHuntingTasks() {
  const { data: session } = useSession();
  const hunterName = (session?.user as any)?.hunterName || "";

  const fetcher = async ([_key, hName]: [string, string]) => {
    if (!hName) return [];
    const { data, error } = await supabase
      .from('hunting_tasks')
      .select('*')
      .eq('hunter_name', hName)
      .order('order_index', { ascending: true })
      .order('created_at', { ascending: true });
    if (error) throw error;
    return data as DBTask[];
  };

  const { data: dbTasks, mutate, isLoading } = useSWR(
    hunterName ? ['hunting_tasks', hunterName] : null,
    fetcher,
    {
      revalidateOnFocus: true,
    }
  );

  const emptyWeeks = useMemo(() => generateEmptyWeeks(new Date()), []);
  
  const actualCurrentWeekIndex = useMemo(() => {
    const now = new Date();
    const isPastFriday17 = (now.getDay() === 5 && now.getHours() >= 17) || now.getDay() === 6 || now.getDay() === 0;
    return isPastFriday17 ? 5 : 4; // 5 is the physical current week (countPast)
  }, []);

  // Transform flat DB rows into nested Weeks -> Tasks -> Subs structure
  const weeks = useMemo(() => {
    if (!dbTasks) return emptyWeeks;

    const weeksMap = new Map(emptyWeeks.map(w => [w.id, { ...w, tasks: [] as Task[] }]));

    const mainTasks = dbTasks.filter(t => t.parent_id === null);
    const subTasks = dbTasks.filter(t => t.parent_id !== null);

    mainTasks.forEach(mt => {
      const week = weeksMap.get(mt.week_id);
      if (week) {
        const subs = subTasks
          .filter(st => st.parent_id === mt.id)
          .map(st => ({ id: st.id, text: st.text, status: st.status }));
        
        week.tasks.push({
          id: mt.id,
          text: mt.text,
          status: mt.status,
          subs,
          order_index: mt.order_index
        });
      }
    });

    return Array.from(weeksMap.values());
  }, [dbTasks, emptyWeeks]);

  const hasPruned = useRef(false);

  React.useEffect(() => {
    if (dbTasks && dbTasks.length > 0 && hunterName && !hasPruned.current) {
      hasPruned.current = true;
      const validWeekIds = new Set(emptyWeeks.map(w => w.id));
      const oldTasks = dbTasks.filter(t => !validWeekIds.has(t.week_id));
      
      if (oldTasks.length > 0) {
        const oldTaskIds = oldTasks.map(t => t.id);
        
        // Optimistic UI update
        mutate(current => current?.filter(t => !oldTaskIds.includes(t.id)), false);
        
        // Delete from database in chunks if there are many, but Supabase supports up to 1000 items in `.in`
        supabase.from('hunting_tasks').delete().in('id', oldTaskIds).then(({ error }) => {
          if (error) console.error("Failed to prune old tasks:", error);
          else console.log(`Pruned ${oldTaskIds.length} old tasks.`);
        });
      }
    }
  }, [dbTasks, emptyWeeks, hunterName, mutate]);

  const toggleStatus = async (weekId: string, taskId: string, subId?: string) => {
    if (!hunterName) return;
    const mainTask = dbTasks?.find(t => t.id === taskId);
    if (!mainTask) return;

    // Check if the main task has any subtasks
    const subs = dbTasks!.filter(t => t.parent_id === taskId) as SubTask[];

    if (subId) {
      const subTask = dbTasks?.find(t => t.id === subId);
      if (!subTask) return;

      const newStatus = cycleStatus(subTask.status);
      
      // Optimistic update
      mutate(current => {
        if (!current) return current;
        return current.map(t => t.id === subId ? { ...t, status: newStatus } : t);
      }, false);

      await supabase.from('hunting_tasks').update({ status: newStatus }).eq('id', subId);

      // Recalculate main task status
      const updatedSubs = subs.map(t => t.id === subId ? { ...t, status: newStatus } : t) as SubTask[];
      const newMainStatus = calculateMainStatus(updatedSubs, mainTask.status);
      
      if (newMainStatus !== mainTask.status) {
        mutate(current => {
          if (!current) return current;
          return current.map(t => t.id === taskId ? { ...t, status: newMainStatus } : t);
        }, false);
        await supabase.from('hunting_tasks').update({ status: newMainStatus }).eq('id', taskId);
      }
    } else {
      // Rule: Cannot toggle main task directly if it has subtasks
      if (subs.length > 0) return;

      const newStatus = cycleStatus(mainTask.status);
      mutate(current => {
        if (!current) return current;
        return current.map(t => t.id === taskId ? { ...t, status: newStatus } : t);
      }, false);
      await supabase.from('hunting_tasks').update({ status: newStatus }).eq('id', taskId);
    }
    
    mutate(); // Refetch to sync
  };

  const populatedWeeks = React.useRef<Set<string>>(new Set());

  const populateDefaultTasks = async (weekId: string) => {
    if (!hunterName || !dbTasks) return;
    
    // Prevent double population by checking if tasks already exist in current cache or if already populating
    if (populatedWeeks.current.has(weekId)) return;
    if (dbTasks.some(t => t.week_id === weekId)) {
      populatedWeeks.current.add(weekId);
      return;
    }

    populatedWeeks.current.add(weekId);

    const defaultTasks = [
      { week_id: weekId, hunter_name: hunterName, text: "新任務", status: "todo", order_index: 1000 },
      { week_id: weekId, hunter_name: hunterName, text: "新任務", status: "todo", order_index: 2000 },
      { week_id: weekId, hunter_name: hunterName, text: "新任務", status: "todo", order_index: 3000 },
      { week_id: weekId, hunter_name: hunterName, text: "體能", status: "todo", order_index: 4000 },
      { week_id: weekId, hunter_name: hunterName, text: "格局", status: "todo", order_index: 5000 },
    ];

    // Optimistically insert them to avoid flicker
    mutate(current => {
      const tempTasks = defaultTasks.map((t, i) => ({ ...t, id: `temp-${Date.now()}-${i}`, parent_id: null })) as DBTask[];
      return [...(current || []), ...tempTasks];
    }, false);

    await supabase.from('hunting_tasks').insert(defaultTasks);
    mutate();
  };

  const updateText = async (id: string, text: string) => {
    if (!hunterName) return;
    mutate(current => {
      if (!current) return current;
      return current.map(t => t.id === id ? { ...t, text } : t);
    }, false);
    await supabase.from('hunting_tasks').update({ text }).eq('id', id);
    mutate();
  };

  const addTask = async (weekId: string) => {
    if (!hunterName) return;
    const maxOrder = dbTasks?.filter(t => t.week_id === weekId && !t.parent_id).reduce((max, t) => Math.max(max, t.order_index), 0) ?? 0;
    const newTask = {
      week_id: weekId,
      hunter_name: hunterName,
      parent_id: null,
      text: "新任務",
      status: "todo",
      order_index: maxOrder + 1000,
    };
    const { data, error } = await supabase.from('hunting_tasks').insert(newTask).select().single();
    if (error) console.error(error);
    if (data) {
      mutate(current => [...(current || []), data as DBTask], false);
    }
    return data;
  };

  const addSubtask = async (weekId: string, taskId: string) => {
    if (!hunterName) return;
    const maxOrder = dbTasks?.filter(t => t.parent_id === taskId).reduce((max, t) => Math.max(max, t.order_index), 0) ?? 0;
    const newSub = {
      week_id: weekId,
      hunter_name: hunterName,
      parent_id: taskId,
      text: "新子任務",
      status: "todo",
      order_index: maxOrder + 1000,
    };
    const { data, error } = await supabase.from('hunting_tasks').insert(newSub).select().single();
    if (error) console.error(error);
    if (data) {
      mutate(current => [...(current || []), data as DBTask], false);
      
      // Calculate main status
      const mainTask = dbTasks?.find(t => t.id === taskId);
      if (mainTask) {
         const subs = [...(dbTasks!.filter(t => t.parent_id === taskId) as any), data];
         const newMainStatus = calculateMainStatus(subs as SubTask[], mainTask.status);
         if (newMainStatus !== mainTask.status) {
           await supabase.from('hunting_tasks').update({ status: newMainStatus }).eq('id', taskId);
         }
      }
    }
    mutate();
    return data;
  };

  const ensureMainStatus = async (currentData: DBTask[], mainTaskId: string) => {
    const mainTask = currentData.find(t => t.id === mainTaskId);
    if (!mainTask) return currentData;
    const subs = currentData.filter(t => t.parent_id === mainTaskId) as SubTask[];
    const newMainStatus = calculateMainStatus(subs, mainTask.status);
    if (newMainStatus !== mainTask.status) {
      await supabase.from('hunting_tasks').update({ status: newMainStatus }).eq('id', mainTaskId);
      return currentData.map(t => t.id === mainTaskId ? { ...t, status: newMainStatus } : t);
    }
    return currentData;
  };

  const deleteTask = async (id: string) => {
    if (!hunterName || !dbTasks) return;
    const taskToDelete = dbTasks.find(t => t.id === id);
    const parentId = taskToDelete?.parent_id;

    let newData = dbTasks.filter(t => t.id !== id && t.parent_id !== id);
    await supabase.from('hunting_tasks').delete().eq('id', id);

    if (parentId) {
       newData = await ensureMainStatus(newData, parentId);
    }
    mutate(newData, false);
    mutate();
  };

  const reorderSubtasks = async (sourceTaskId: string, destTaskId: string, sourceIndex: number, destIndex: number) => {
    if (!dbTasks || !hunterName) return;
    
    // Build sorted source/dest lists from a snapshot of current data
    const snapshot = [...dbTasks];
    const sourceSubs = snapshot.filter(t => t.parent_id === sourceTaskId).sort((a,b) => a.order_index - b.order_index);
    const destSubs = sourceTaskId === destTaskId 
      ? sourceSubs 
      : snapshot.filter(t => t.parent_id === destTaskId).sort((a,b) => a.order_index - b.order_index);
    
    if (!sourceSubs[sourceIndex]) return;
    const movedItemId = sourceSubs[sourceIndex].id;
    
    // Remove from source
    sourceSubs.splice(sourceIndex, 1);
    
    // Calculate new order_index based on destination position
    let newOrder = 0;
    if (sourceTaskId === destTaskId) {
      // Same parent — destSubs is the same array after splice
      destSubs.splice(destIndex, 0, { ...snapshot.find(t => t.id === movedItemId)! });
      if (destSubs.length === 1) {
        newOrder = 1000;
      } else if (destIndex === 0) {
        newOrder = destSubs[1].order_index - 100;
      } else if (destIndex === destSubs.length - 1) {
        newOrder = destSubs[destSubs.length - 2].order_index + 1000;
      } else {
        newOrder = (destSubs[destIndex - 1].order_index + destSubs[destIndex + 1].order_index) / 2;
      }
    } else {
      // Different parent
      destSubs.splice(destIndex, 0, { ...snapshot.find(t => t.id === movedItemId)! });
      if (destSubs.length === 1) {
        newOrder = 1000;
      } else if (destIndex === 0) {
        newOrder = destSubs[1].order_index - 100;
      } else if (destIndex === destSubs.length - 1) {
        newOrder = destSubs[destSubs.length - 2].order_index + 1000;
      } else {
        newOrder = (destSubs[destIndex - 1].order_index + destSubs[destIndex + 1].order_index) / 2;
      }
    }

    // Build completely new data array with the moved item updated
    let newData = snapshot.map(t => 
      t.id === movedItemId 
        ? { ...t, parent_id: destTaskId, order_index: newOrder } 
        : t
    );

    // Save to DB in background
    await supabase.from('hunting_tasks').update({ parent_id: destTaskId, order_index: newOrder }).eq('id', movedItemId);

    if (sourceTaskId !== destTaskId) {
      newData = await ensureMainStatus(newData, sourceTaskId);
      newData = await ensureMainStatus(newData, destTaskId);
    }

    // Synchronous optimistic update — force SWR to immediately use this data
    mutate(newData, { revalidate: false });

    // Revalidate after a delay to sync with server
    setTimeout(() => mutate(), 1000);
  };

  const copyFromPreviousWeek = async (sourceWeekId: string, targetWeekId: string, withSubtasks: boolean) => {
    if (!hunterName || !dbTasks) return;
    
    // 1. Clear target week tasks
    const targetTasks = dbTasks.filter(t => t.week_id === targetWeekId);
    const targetTaskIds = targetTasks.map(t => t.id);
    if (targetTaskIds.length > 0) {
      // Supabase in() has a limit, but for a week it shouldn't exceed 1000
      await supabase.from('hunting_tasks').delete().in('id', targetTaskIds);
    }

    // 2. Find source main tasks
    const sourceMainTasks = dbTasks.filter(t => t.week_id === sourceWeekId && !t.parent_id).sort((a,b) => a.order_index - b.order_index);
    if (sourceMainTasks.length === 0) {
      mutate();
      return;
    }

    const mainTasksToInsert = sourceMainTasks.map(t => ({
      week_id: targetWeekId,
      hunter_name: hunterName,
      parent_id: null,
      text: t.text,
      status: "todo",
      order_index: t.order_index
    }));

    const { data: insertedMainTasks, error } = await supabase.from('hunting_tasks').insert(mainTasksToInsert).select();
    
    if (error || !insertedMainTasks) {
      console.error("Error copying tasks", error);
      mutate();
      return;
    }

    // 3. Copy subtasks if requested
    if (withSubtasks) {
      const sourceSubTasks = dbTasks.filter(t => t.week_id === sourceWeekId && t.parent_id);
      const subTasksToInsert: any[] = [];

      for (const srcSub of sourceSubTasks) {
        const srcParent = sourceMainTasks.find(m => m.id === srcSub.parent_id);
        if (srcParent) {
          // Find matching newly inserted parent
          const newParent = insertedMainTasks.find(m => m.text === srcParent.text && m.order_index === srcParent.order_index);
          if (newParent) {
            subTasksToInsert.push({
              week_id: targetWeekId,
              hunter_name: hunterName,
              parent_id: newParent.id,
              text: srcSub.text,
              status: "todo",
              order_index: srcSub.order_index
            });
          }
        }
      }

      if (subTasksToInsert.length > 0) {
        await supabase.from('hunting_tasks').insert(subTasksToInsert);
      }
    }
    
    mutate();
  };

  return {
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
    copyFromPreviousWeek,
  };
}
