import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api, type User } from '../api';
import type { Project, Task, TaskPriority, SubProject } from '../types';

type ViewMode = 'day' | 'week' | 'month';

const PRIORITY_COLORS: Record<TaskPriority, { bar: string; border: string; text: string }> = {
  critical: { bar: 'rgb(239 68 68)', border: 'rgb(185 28 28)', text: 'Kritikus' },
  high: { bar: 'rgb(249 115 22)', border: 'rgb(194 65 12)', text: 'Magas' },
  medium: { bar: 'rgb(245 158 11)', border: 'rgb(180 83 9)', text: 'Közepes' },
  low: { bar: 'rgb(100 116 139)', border: 'rgb(71 85 105)', text: 'Alacsony' },
};

const STATUS_COLORS: Record<string, string> = {
  'Beérkező': '#64748b',
  'Teendő': '#3b82f6',
  'Folyamatban': '#f59e0b',
  'Várakozás': '#8b5cf6',
  'Felülvizsgálat': '#06b6d4',
  'Kész': '#22c55e',
};

const ROW_HEIGHT = 44;
const HEADER_HEIGHT = 64;
const SIDEBAR_WIDTH = 320;
const MIN_COL_WIDTH = 32;

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function startOfWeek(date: Date): Date {
  const d = startOfDay(date);
  const day = d.getDay();
  d.setDate(d.getDate() - ((day + 6) % 7));
  return d;
}

function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function diffDays(a: Date, b: Date): number {
  return Math.round((a.getTime() - b.getTime()) / (1000 * 60 * 60 * 24));
}

function formatDate(d: Date): string {
  return d.toLocaleDateString('hu-HU', { month: 'short', day: 'numeric' });
}

function formatMonthYear(d: Date): string {
  return d.toLocaleDateString('hu-HU', { year: 'numeric', month: 'long' });
}

function getColWidth(mode: ViewMode): number {
  switch (mode) {
    case 'day': return 40;
    case 'week': return 120;
    case 'month': return 160;
  }
}

interface GanttTask extends Task {
  _barStart: number;
  _barWidth: number;
  _hasSchedule: boolean;
}

function EditModal({
  task,
  users,
  onSave,
  onClose,
}: {
  task: Task;
  users: User[];
  onSave: (updates: {
    startAt?: string | null;
    estimatedHours?: number | null;
    dueAt?: string | null;
    assigneeId?: string | null;
    priority?: string;
  }) => void;
  onClose: () => void;
}) {
  const [startAt, setStartAt] = useState(
    task.startAt ? new Date(task.startAt).toISOString().slice(0, 10) : '',
  );
  const [hours, setHours] = useState(task.estimatedHours?.toString() || '');
  const [dueAt, setDueAt] = useState(
    task.dueAt ? new Date(task.dueAt).toISOString().slice(0, 10) : '',
  );
  const [assigneeId, setAssigneeId] = useState(task.assigneeId || '');
  const [priority, setPriority] = useState(task.priority);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({
      startAt: startAt || null,
      estimatedHours: hours ? parseFloat(hours) : null,
      dueAt: dueAt || null,
      assigneeId: assigneeId || null,
      priority,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div
        className="bg-slate-800 border border-slate-600 rounded-xl p-6 w-full max-w-md shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg font-semibold text-slate-100 mb-1">
          <span className="text-amber-500 font-mono text-sm mr-2">T-{task.shortId}</span>
          {task.title}
        </h3>
        <p className="text-xs text-slate-500 mb-4">{task.status}</p>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-slate-400 mb-1">Kezdés</label>
              <input
                type="date"
                value={startAt}
                onChange={(e) => setStartAt(e.target.value)}
                className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/50"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Becsült idő (óra)</label>
              <input
                type="number"
                step="0.5"
                min="0"
                value={hours}
                onChange={(e) => setHours(e.target.value)}
                placeholder="pl. 8"
                className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/50"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs text-slate-400 mb-1">Határidő</label>
            <input
              type="date"
              value={dueAt}
              onChange={(e) => setDueAt(e.target.value)}
              className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/50"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-slate-400 mb-1">Felelős</label>
              <select
                value={assigneeId}
                onChange={(e) => setAssigneeId(e.target.value)}
                className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/50"
              >
                <option value="">— Nincs —</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name || u.email}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Prioritás</label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as TaskPriority)}
                className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/50"
              >
                <option value="critical">Kritikus</option>
                <option value="high">Magas</option>
                <option value="medium">Közepes</option>
                <option value="low">Alacsony</option>
              </select>
            </div>
          </div>

          <div className="flex gap-2 pt-2">
            <button
              type="submit"
              className="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white text-sm font-medium rounded-lg transition-colors"
            >
              Mentés
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-slate-400 hover:text-slate-200 text-sm transition-colors"
            >
              Mégse
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function DependencyArrows({
  tasks,
}: {
  tasks: GanttTask[];
}) {
  const taskIndex = useMemo(() => {
    const map = new Map<string, number>();
    tasks.forEach((t, i) => map.set(t.id, i));
    return map;
  }, [tasks]);

  const arrows: { x1: number; y1: number; x2: number; y2: number }[] = [];

  for (const task of tasks) {
    if (!task.dependsOn) continue;
    const depIdx = taskIndex.get(task.id);
    if (depIdx === undefined) continue;

    for (const dep of task.dependsOn) {
      const preIdx = taskIndex.get(dep.prerequisiteId);
      if (preIdx === undefined) continue;
      const pre = tasks[preIdx];

      const x1 = pre._barStart + pre._barWidth;
      const y1 = preIdx * ROW_HEIGHT + ROW_HEIGHT / 2;
      const x2 = task._barStart;
      const y2 = depIdx * ROW_HEIGHT + ROW_HEIGHT / 2;

      arrows.push({ x1, y1, x2, y2 });
    }
  }

  if (arrows.length === 0) return null;

  return (
    <svg className="absolute top-0 left-0 w-full h-full pointer-events-none" style={{ overflow: 'visible' }}>
      <defs>
        <marker id="arrowhead" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
          <polygon points="0 0, 8 3, 0 6" fill="rgb(148 163 184)" />
        </marker>
      </defs>
      {arrows.map((a, i) => {
        const midX = a.x1 + (a.x2 - a.x1) / 2;
        return (
          <path
            key={i}
            d={`M ${a.x1} ${a.y1} C ${midX} ${a.y1}, ${midX} ${a.y2}, ${a.x2} ${a.y2}`}
            stroke="rgb(148 163 184)"
            strokeWidth="1.5"
            fill="none"
            opacity="0.5"
            markerEnd="url(#arrowhead)"
          />
        );
      })}
    </svg>
  );
}

export function GanttView() {
  const { projectId } = useParams<{ projectId: string }>();
  const [project, setProject] = useState<Project | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [subProjects, setSubProjects] = useState<SubProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [viewMode, setViewMode] = useState<ViewMode>('day');
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [filterPriority, setFilterPriority] = useState<string>('all');
  const [filterAssignee, setFilterAssignee] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('active');
  const [filterSubProject, setFilterSubProject] = useState<string>('all');
  const timelineRef = useRef<HTMLDivElement>(null);
  const [dragTask, setDragTask] = useState<{ id: string; startX: number; originalStart: Date; edge: 'move' | 'resize' } | null>(null);

  const load = useCallback(async () => {
    if (!projectId) return;
    try {
      setError('');
      const [proj, taskList, userList, spList] = await Promise.all([
        api.projects.get(projectId),
        api.tasks.list({ project: projectId }),
        api.users.list(),
        api.projects.subProjects(projectId),
      ]);
      setProject(proj);
      setTasks(taskList);
      setUsers(userList);
      setSubProjects(spList);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Hiba');
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    load();
  }, [load]);

  const filteredTasks = useMemo(() => {
    return tasks.filter((t) => {
      if (filterStatus === 'active' && (t.status === 'Kész')) return false;
      if (filterStatus === 'scheduled' && !t.startAt) return false;
      if (filterPriority !== 'all' && t.priority !== filterPriority) return false;
      if (filterAssignee !== 'all' && t.assigneeId !== filterAssignee) return false;
      if (filterSubProject === '__none__' && t.subProjectId) return false;
      if (filterSubProject !== 'all' && filterSubProject !== '__none__' && t.subProjectId !== filterSubProject) return false;
      return true;
    });
  }, [tasks, filterPriority, filterAssignee, filterStatus, filterSubProject]);

  const sortedTasks = useMemo(() => {
    const spOrder = new Map<string, number>();
    subProjects.forEach((sp, i) => spOrder.set(sp.id, i));

    return [...filteredTasks].sort((a, b) => {
      const aSpIdx = a.subProjectId ? (spOrder.get(a.subProjectId) ?? 999) : 1000;
      const bSpIdx = b.subProjectId ? (spOrder.get(b.subProjectId) ?? 999) : 1000;
      if (aSpIdx !== bSpIdx) return aSpIdx - bSpIdx;

      if (a.startAt && !b.startAt) return -1;
      if (!a.startAt && b.startAt) return 1;
      if (a.startAt && b.startAt) return new Date(a.startAt).getTime() - new Date(b.startAt).getTime();
      const pOrder = { critical: 0, high: 1, medium: 2, low: 3 };
      return (pOrder[a.priority] ?? 2) - (pOrder[b.priority] ?? 2);
    });
  }, [filteredTasks, subProjects]);

  const groupHeaders = useMemo(() => {
    if (subProjects.length === 0) return new Map<number, SubProject | null>();
    const headers = new Map<number, SubProject | null>();
    let lastSpId: string | null | undefined = undefined;
    sortedTasks.forEach((t, i) => {
      const spId = t.subProjectId || null;
      if (spId !== lastSpId) {
        const sp = spId ? subProjects.find((s) => s.id === spId) || null : null;
        headers.set(i, sp);
        lastSpId = spId;
      }
    });
    return headers;
  }, [sortedTasks, subProjects]);

  const colWidth = getColWidth(viewMode);

  const { timelineStart, columns } = useMemo(() => {
    const now = new Date();
    let earliest = startOfDay(addDays(now, -7));
    let latest = startOfDay(addDays(now, 30));

    for (const t of sortedTasks) {
      if (t.startAt) {
        const s = startOfDay(new Date(t.startAt));
        if (s < earliest) earliest = addDays(s, -3);
      }
      if (t.dueAt) {
        const d = startOfDay(new Date(t.dueAt));
        if (d > latest) latest = addDays(d, 7);
      }
      if (t.startAt && t.estimatedHours) {
        const end = addDays(new Date(t.startAt), Math.ceil(t.estimatedHours / 8));
        if (end > latest) latest = addDays(end, 7);
      }
    }

    const cols: { date: Date; label: string; isToday: boolean; isWeekend: boolean }[] = [];
    const todayStr = startOfDay(now).toISOString();

    if (viewMode === 'day') {
      let d = startOfDay(earliest);
      while (d <= latest) {
        const dow = d.getDay();
        cols.push({
          date: new Date(d),
          label: d.getDate().toString(),
          isToday: d.toISOString() === todayStr,
          isWeekend: dow === 0 || dow === 6,
        });
        d = addDays(d, 1);
      }
    } else if (viewMode === 'week') {
      let d = startOfWeek(earliest);
      while (d <= latest) {
        cols.push({
          date: new Date(d),
          label: formatDate(d),
          isToday: diffDays(startOfDay(now), d) >= 0 && diffDays(startOfDay(now), d) < 7,
          isWeekend: false,
        });
        d = addDays(d, 7);
      }
    } else {
      let d = startOfMonth(earliest);
      while (d <= latest) {
        cols.push({
          date: new Date(d),
          label: formatMonthYear(d),
          isToday: d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear(),
          isWeekend: false,
        });
        d = new Date(d.getFullYear(), d.getMonth() + 1, 1);
      }
    }

    return {
      timelineStart: cols[0]?.date || earliest,
      columns: cols,
    };
  }, [sortedTasks, viewMode]);

  function dateToX(date: Date): number {
    if (viewMode === 'day') {
      return diffDays(startOfDay(date), timelineStart) * colWidth;
    } else if (viewMode === 'week') {
      const days = diffDays(startOfDay(date), startOfWeek(timelineStart));
      return (days / 7) * colWidth;
    } else {
      const monthsDiff =
        (date.getFullYear() - timelineStart.getFullYear()) * 12 +
        date.getMonth() - timelineStart.getMonth() +
        (date.getDate() - 1) / 30;
      return monthsDiff * colWidth;
    }
  }

  const ganttTasks: GanttTask[] = useMemo(() => {
    return sortedTasks.map((t) => {
      const hasSchedule = !!(t.startAt && (t.estimatedHours || t.dueAt));
      let barStart = 0;
      let barWidth = colWidth;

      if (t.startAt) {
        barStart = dateToX(new Date(t.startAt));
        if (t.estimatedHours) {
          const durationDays = Math.max(1, Math.ceil(t.estimatedHours / 8));
          barWidth = dateToX(addDays(new Date(t.startAt), durationDays)) - barStart;
        } else if (t.dueAt) {
          barWidth = Math.max(colWidth, dateToX(new Date(t.dueAt)) - barStart);
        } else {
          barWidth = colWidth;
        }
      } else if (t.dueAt) {
        barStart = dateToX(addDays(new Date(t.dueAt), -1));
        barWidth = colWidth;
      } else {
        barStart = dateToX(new Date());
        barWidth = colWidth;
      }

      barWidth = Math.max(barWidth, MIN_COL_WIDTH);

      return { ...t, _barStart: barStart, _barWidth: barWidth, _hasSchedule: hasSchedule };
    });
  }, [sortedTasks, timelineStart, colWidth, viewMode]);

  const todayX = dateToX(startOfDay(new Date()));
  const totalWidth = columns.length * colWidth;
  const totalHeight = ganttTasks.length * ROW_HEIGHT;

  const handleDragStart = useCallback(
    (taskId: string, e: React.MouseEvent, edge: 'move' | 'resize') => {
      e.preventDefault();
      e.stopPropagation();
      const task = ganttTasks.find((t) => t.id === taskId);
      if (!task) return;
      const originalStart = task.startAt ? new Date(task.startAt) : new Date();
      setDragTask({ id: taskId, startX: e.clientX, originalStart, edge });
    },
    [ganttTasks],
  );

  useEffect(() => {
    if (!dragTask) return;

    const handleMouseMove = (_e: MouseEvent) => {
      void _e;
    };

    const handleMouseUp = async (e: MouseEvent) => {
      const dx = e.clientX - dragTask.startX;
      const daysDelta = Math.round(dx / colWidth * (viewMode === 'day' ? 1 : viewMode === 'week' ? 7 : 30));

      if (Math.abs(daysDelta) > 0) {
        const task = tasks.find((t) => t.id === dragTask.id);
        if (!task) { setDragTask(null); return; }

        try {
          if (dragTask.edge === 'move') {
            const newStart = addDays(dragTask.originalStart, daysDelta);
            await api.tasks.update(dragTask.id, {
              startAt: newStart.toISOString(),
            });
          } else {
            const currentHours = task.estimatedHours || 8;
            const currentDays = Math.ceil(currentHours / 8);
            const newDays = Math.max(1, currentDays + daysDelta);
            await api.tasks.update(dragTask.id, {
              estimatedHours: newDays * 8,
            });
          }
          load();
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Hiba');
        }
      }
      setDragTask(null);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [dragTask, colWidth, viewMode, tasks, load]);

  const handleSaveTask = async (updates: {
    startAt?: string | null;
    estimatedHours?: number | null;
    dueAt?: string | null;
    assigneeId?: string | null;
    priority?: string;
  }) => {
    if (!editingTask) return;
    try {
      await api.tasks.update(editingTask.id, updates);
      setEditingTask(null);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Hiba');
    }
  };

  useEffect(() => {
    if (timelineRef.current && !loading) {
      const todayOffset = todayX - timelineRef.current.clientWidth / 3;
      timelineRef.current.scrollLeft = Math.max(0, todayOffset);
    }
  }, [loading, todayX]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-pulse text-slate-400">Betöltés...</div>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-red-400">Projekt nem található</p>
      </div>
    );
  }

  const scheduledCount = tasks.filter((t) => t.startAt).length;
  const unscheduledCount = tasks.filter((t) => !t.startAt && t.status !== 'Kész').length;

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="border-b border-slate-800 bg-slate-900/50 sticky top-0 z-20">
        <div className="max-w-[1920px] mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link to="/" className="text-slate-400 hover:text-slate-200 transition-colors">
              ← Projektcsoportok
            </Link>
            <h1 className="text-xl font-semibold text-slate-100">{project.name}</h1>
            <span className="text-[10px] px-1.5 py-0.5 bg-slate-800/80 text-slate-500 border border-slate-700/50 rounded font-medium">
              csoport
            </span>
            <div className="flex items-center bg-slate-800 rounded-lg overflow-hidden ml-2">
              <Link
                to={`/project/${projectId}`}
                className="px-3 py-1.5 text-xs font-medium text-slate-400 hover:text-slate-200 transition-colors"
              >
                Kanban
              </Link>
              <span className="px-3 py-1.5 text-xs font-medium bg-amber-600 text-white">
                Gantt
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link
              to={`/project/${projectId}/settings`}
              className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-200 text-sm font-medium rounded-lg transition-colors"
            >
              Beállítások
            </Link>
          </div>
        </div>
      </header>

      {/* Toolbar */}
      <div className="border-b border-slate-800 bg-slate-900/30">
        <div className="max-w-[1920px] mx-auto px-4 py-2 flex items-center gap-4 flex-wrap">
          {/* View mode */}
          <div className="flex items-center bg-slate-800 rounded-lg overflow-hidden">
            {(['day', 'week', 'month'] as ViewMode[]).map((mode) => (
              <button
                key={mode}
                onClick={() => setViewMode(mode)}
                className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                  viewMode === mode
                    ? 'bg-amber-600 text-white'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {mode === 'day' ? 'Nap' : mode === 'week' ? 'Hét' : 'Hónap'}
              </button>
            ))}
          </div>

          {/* Filters */}
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="px-3 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-slate-200 text-xs focus:outline-none focus:ring-1 focus:ring-amber-500/50"
          >
            <option value="all">Minden státusz</option>
            <option value="active">Aktív</option>
            <option value="scheduled">Ütemezett</option>
          </select>

          <select
            value={filterPriority}
            onChange={(e) => setFilterPriority(e.target.value)}
            className="px-3 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-slate-200 text-xs focus:outline-none focus:ring-1 focus:ring-amber-500/50"
          >
            <option value="all">Minden prioritás</option>
            <option value="critical">Kritikus</option>
            <option value="high">Magas</option>
            <option value="medium">Közepes</option>
            <option value="low">Alacsony</option>
          </select>

          <select
            value={filterAssignee}
            onChange={(e) => setFilterAssignee(e.target.value)}
            className="px-3 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-slate-200 text-xs focus:outline-none focus:ring-1 focus:ring-amber-500/50"
          >
            <option value="all">Minden felelős</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name || u.email}
              </option>
            ))}
          </select>

          {subProjects.length > 0 && (
            <select
              value={filterSubProject}
              onChange={(e) => setFilterSubProject(e.target.value)}
              className="px-3 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-slate-200 text-xs focus:outline-none focus:ring-1 focus:ring-amber-500/50"
            >
              <option value="all">Minden projekt</option>
              {subProjects.map((sp) => (
                <option key={sp.id} value={sp.id}>
                  {sp.name}
                </option>
              ))}
              <option value="__none__">Projekt nélkül</option>
            </select>
          )}

          <div className="ml-auto flex items-center gap-3 text-xs text-slate-500">
            <span>
              <span className="text-amber-500 font-medium">{scheduledCount}</span> ütemezett
            </span>
            <span>
              <span className="text-slate-300 font-medium">{unscheduledCount}</span> ütemezetlen
            </span>
          </div>
        </div>
      </div>

      {error && (
        <div className="mx-4 mt-2 p-3 bg-red-900/30 border border-red-800 rounded-lg text-red-300 text-sm">
          {error}
        </div>
      )}

      {/* Gantt body */}
      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar */}
        <div className="flex-shrink-0 border-r border-slate-800 bg-slate-900/60" style={{ width: SIDEBAR_WIDTH }}>
          {/* Sidebar header */}
          <div
            className="border-b border-slate-700 bg-slate-800/50 px-3 flex items-center text-xs font-medium text-slate-400 uppercase tracking-wide"
            style={{ height: HEADER_HEIGHT }}
          >
            <span className="w-12">ID</span>
            <span className="flex-1 ml-2">Feladat</span>
            <span className="w-16 text-right">Időtartam</span>
          </div>
          {/* Task rows */}
          <div className="overflow-y-auto" style={{ height: `calc(100vh - ${HEADER_HEIGHT + 120}px)` }}>
            {ganttTasks.map((task, i) => (
              <div key={task.id}>
                {groupHeaders.has(i) && subProjects.length > 0 && (
                  <div
                    className="flex items-center gap-2 px-3 bg-slate-800/60 border-b border-slate-700/40"
                    style={{ height: 28 }}
                  >
                    {groupHeaders.get(i) ? (
                      <>
                        <span
                          className="w-2 h-2 rounded-full flex-shrink-0"
                          style={{ backgroundColor: groupHeaders.get(i)!.color || '#3b82f6' }}
                        />
                        <span className="text-[10px] font-semibold text-slate-300 uppercase tracking-wider truncate">
                          {groupHeaders.get(i)!.name}
                        </span>
                        <span className="text-[10px] text-slate-500">
                          ({sortedTasks.filter((t) => t.subProjectId === groupHeaders.get(i)!.id).length})
                        </span>
                      </>
                    ) : (
                      <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
                        Projekt nélkül
                      </span>
                    )}
                  </div>
                )}
                <div
                  className="flex items-center px-3 border-b border-slate-800/50 hover:bg-slate-800/30 cursor-pointer transition-colors group"
                  style={{ height: ROW_HEIGHT }}
                  onClick={() => setEditingTask(task)}
                >
                  <span className="w-12 text-amber-500/70 font-mono text-xs">T-{task.shortId}</span>
                  <div className="flex-1 ml-2 min-w-0">
                    <p className="text-sm text-slate-200 truncate">{task.title}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span
                        className="w-2 h-2 rounded-full flex-shrink-0"
                        style={{ backgroundColor: STATUS_COLORS[task.status] || '#64748b' }}
                      />
                      <span className="text-[10px] text-slate-500 truncate">
                        {task.assignee?.name || task.assignee?.email || '—'}
                      </span>
                    </div>
                  </div>
                  <span className="w-16 text-right text-[10px] text-slate-500">
                    {task.estimatedHours ? `${task.estimatedHours}h` : '—'}
                  </span>
                </div>
              </div>
            ))}
            {ganttTasks.length === 0 && (
              <div className="flex items-center justify-center h-32 text-slate-600 text-sm">
                Nincs megjeleníthető feladat
              </div>
            )}
          </div>
        </div>

        {/* Timeline area */}
        <div className="flex-1 overflow-auto" ref={timelineRef}>
          <div style={{ width: totalWidth, minHeight: '100%' }}>
            {/* Timeline header */}
            <div
              className="sticky top-0 z-10 bg-slate-900/95 border-b border-slate-700 flex"
              style={{ height: HEADER_HEIGHT }}
            >
              {/* Month/Week labels (top row) */}
              <div className="absolute top-0 left-0 right-0 flex" style={{ height: HEADER_HEIGHT / 2 }}>
                {viewMode === 'day' && (() => {
                  const months: { label: string; start: number; width: number }[] = [];
                  let currentMonth = '';
                  let startIdx = 0;
                  columns.forEach((col, i) => {
                    const m = col.date.toLocaleDateString('hu-HU', { year: 'numeric', month: 'short' });
                    if (m !== currentMonth) {
                      if (currentMonth) {
                        months.push({ label: currentMonth, start: startIdx * colWidth, width: (i - startIdx) * colWidth });
                      }
                      currentMonth = m;
                      startIdx = i;
                    }
                  });
                  if (currentMonth) {
                    months.push({ label: currentMonth, start: startIdx * colWidth, width: (columns.length - startIdx) * colWidth });
                  }
                  return months.map((m, i) => (
                    <div
                      key={i}
                      className="absolute top-0 flex items-center justify-center text-[10px] text-slate-400 font-medium border-r border-slate-800"
                      style={{ left: m.start, width: m.width, height: HEADER_HEIGHT / 2 }}
                    >
                      {m.label}
                    </div>
                  ));
                })()}
                {viewMode !== 'day' && (
                  <div className="flex items-center px-3 text-xs text-slate-400 font-medium h-full">
                    {viewMode === 'week' ? 'Heti nézet' : 'Havi nézet'}
                  </div>
                )}
              </div>
              {/* Day/Week/Month labels (bottom row) */}
              <div className="absolute bottom-0 left-0 right-0 flex" style={{ height: HEADER_HEIGHT / 2 }}>
                {columns.map((col, i) => (
                  <div
                    key={i}
                    className={`flex-shrink-0 flex items-center justify-center text-[10px] border-r border-slate-800/50 ${
                      col.isToday
                        ? 'text-amber-400 font-bold bg-amber-500/5'
                        : col.isWeekend
                          ? 'text-slate-600'
                          : 'text-slate-500'
                    }`}
                    style={{ width: colWidth, height: HEADER_HEIGHT / 2 }}
                  >
                    {viewMode === 'day' && (
                      <span>
                        {col.label}
                        <span className="ml-0.5 text-[8px]">
                          {col.date.toLocaleDateString('hu-HU', { weekday: 'narrow' })}
                        </span>
                      </span>
                    )}
                    {viewMode !== 'day' && col.label}
                  </div>
                ))}
              </div>
            </div>

            {/* Grid + Bars */}
            <div className="relative" style={{ height: totalHeight }}>
              {/* Background grid */}
              {columns.map((col, i) => (
                <div
                  key={i}
                  className={`absolute top-0 border-r ${
                    col.isWeekend ? 'bg-slate-900/40 border-slate-800/30' : 'border-slate-800/20'
                  }`}
                  style={{ left: i * colWidth, width: colWidth, height: totalHeight }}
                />
              ))}

              {/* Row dividers */}
              {ganttTasks.map((_, i) => (
                <div
                  key={i}
                  className="absolute left-0 right-0 border-b border-slate-800/30"
                  style={{ top: (i + 1) * ROW_HEIGHT }}
                />
              ))}

              {/* Today marker */}
              <div
                className="absolute top-0 w-px bg-amber-500/60 z-10"
                style={{ left: todayX, height: totalHeight }}
              >
                <div className="absolute -top-1 -left-[3px] w-[7px] h-[7px] rounded-full bg-amber-500" />
              </div>

              {/* Dependency arrows */}
              <DependencyArrows
                tasks={ganttTasks}
              />

              {/* Task bars */}
              {ganttTasks.map((task, i) => {
                const colors = PRIORITY_COLORS[task.priority] || PRIORITY_COLORS.medium;
                const isCompleted = task.status === 'Kész';
                const barY = i * ROW_HEIGHT + 8;
                const barH = ROW_HEIGHT - 16;

                return (
                  <div
                    key={task.id}
                    className="absolute group/bar"
                    style={{
                      left: task._barStart,
                      top: barY,
                      width: task._barWidth,
                      height: barH,
                    }}
                  >
                    {/* Bar body */}
                    <div
                      className={`absolute inset-0 rounded-md cursor-pointer transition-all ${
                        isCompleted ? 'opacity-40' : 'hover:brightness-110'
                      } ${!task._hasSchedule ? 'opacity-30 border-dashed' : ''}`}
                      style={{
                        backgroundColor: colors.bar,
                        borderLeft: `3px solid ${colors.border}`,
                      }}
                      onClick={() => setEditingTask(task)}
                      onMouseDown={(e) => {
                        if (task._hasSchedule && e.button === 0) {
                          handleDragStart(task.id, e, 'move');
                        }
                      }}
                    >
                      {/* Progress fill based on status */}
                      {task.status === 'Folyamatban' && (
                        <div
                          className="absolute inset-y-0 left-0 rounded-l-md bg-white/10"
                          style={{ width: '50%' }}
                        />
                      )}

                      {/* Label */}
                      <div className="absolute inset-0 flex items-center px-2 overflow-hidden">
                        <span className="text-[10px] text-white font-medium truncate drop-shadow-sm">
                          {task._barWidth > 80 ? task.title : `T-${task.shortId}`}
                        </span>
                      </div>
                    </div>

                    {/* Resize handle (right edge) */}
                    {task._hasSchedule && (
                      <div
                        className="absolute top-0 right-0 w-2 h-full cursor-ew-resize opacity-0 group-hover/bar:opacity-100 transition-opacity"
                        style={{ backgroundColor: colors.border }}
                        onMouseDown={(e) => handleDragStart(task.id, e, 'resize')}
                      />
                    )}

                    {/* Due date marker */}
                    {task.dueAt && task.startAt && (
                      (() => {
                        const dueX = dateToX(new Date(task.dueAt)) - task._barStart;
                        if (dueX > 0 && dueX < task._barWidth + 50) {
                          return (
                            <div
                              className="absolute top-0 w-px h-full bg-red-400/80"
                              style={{ left: Math.min(dueX, task._barWidth + 20) }}
                            >
                              <div className="absolute -top-1 -left-1 w-2 h-2 bg-red-400 rotate-45" />
                            </div>
                          );
                        }
                        return null;
                      })()
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Legend */}
      <div className="border-t border-slate-800 bg-slate-900/50 px-4 py-2 flex items-center gap-6 text-[10px] text-slate-500">
        <span className="uppercase tracking-wider font-medium text-slate-400">Prioritás:</span>
        {Object.entries(PRIORITY_COLORS).map(([key, val]) => (
          <span key={key} className="flex items-center gap-1">
            <span className="w-3 h-2 rounded-sm" style={{ backgroundColor: val.bar }} />
            {val.text}
          </span>
        ))}
        <span className="mx-2 text-slate-700">|</span>
        <span className="flex items-center gap-1">
          <div className="w-3 h-0.5 bg-amber-500/60" />
          Mai nap
        </span>
        <span className="flex items-center gap-1">
          <div className="w-2 h-2 bg-red-400 rotate-45" />
          Határidő
        </span>
        <span className="flex items-center gap-1">
          <div className="w-3 h-2 rounded-sm bg-slate-500 opacity-30 border border-dashed border-slate-400" />
          Ütemezetlen
        </span>
      </div>

      {/* Edit modal */}
      {editingTask && (
        <EditModal
          task={editingTask}
          users={users}
          onSave={handleSaveTask}
          onClose={() => setEditingTask(null)}
        />
      )}
    </div>
  );
}
