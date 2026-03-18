import { useState, useEffect, useMemo } from 'react';
import { api } from '../api';
import type { Task } from '../types';

interface CronJobSchedule {
  kind: string;
  expr?: string;
  everyMs?: number;
  anchorMs?: number;
  tz?: string;
}

interface CronJobState {
  lastRunAtMs?: number;
  lastStatus?: string;
  lastRunStatus?: string;
  lastDurationMs?: number;
  nextRunAtMs?: number;
  consecutiveErrors?: number;
}

interface CronJob {
  id: string;
  name: string;
  description?: string;
  enabled: boolean;
  schedule: CronJobSchedule;
  state: CronJobState;
  agentId?: string;
}

interface CronRun {
  ts: number;
  jobId: string;
  action: string;
  status: string;
  summary?: string;
  durationMs?: number;
  runAtMs?: number;
  model?: string;
  provider?: string;
  usage?: { input_tokens: number; output_tokens: number; total_tokens: number };
}

interface ProjectedRun {
  ts: number;
  jobId: string;
  jobName: string;
  projected: true;
}

type CalendarEvent =
  | (CronRun & { projected?: false })
  | ProjectedRun;

const HU_DAYS = ['H', 'K', 'Sze', 'Cs', 'P', 'Szo', 'V'];
const HU_MONTHS = [
  'Január', 'Február', 'Március', 'Április', 'Május', 'Június',
  'Július', 'Augusztus', 'Szeptember', 'Október', 'November', 'December',
];

function toDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function getMonthGrid(year: number, month: number) {
  const firstDay = new Date(year, month, 1);
  let startDow = firstDay.getDay();
  if (startDow === 0) startDow = 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const cells: (number | null)[] = [];
  for (let i = 1; i < startDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

function projectFutureRuns(jobs: CronJob[], rangeStart: Date, rangeEnd: Date): ProjectedRun[] {
  const now = Date.now();
  const startMs = rangeStart.getTime();
  const endMs = rangeEnd.getTime();
  const runs: ProjectedRun[] = [];

  for (const job of jobs) {
    if (!job.enabled) continue;
    const sched = job.schedule;

    if (sched.kind === 'every' && sched.everyMs && sched.everyMs > 0) {
      let cursor = job.state?.nextRunAtMs || now;

      if (cursor > endMs) continue;
      if (cursor < startMs) {
        const skipSteps = Math.floor((startMs - cursor) / sched.everyMs);
        cursor += skipSteps * sched.everyMs;
      }

      const maxPerJob = 500;
      let count = 0;
      while (cursor <= endMs && count < maxPerJob) {
        if (cursor >= startMs && cursor > now) {
          runs.push({ ts: cursor, jobId: job.id, jobName: job.name, projected: true });
        }
        cursor += sched.everyMs;
        count++;
      }
    } else if (sched.kind === 'cron' && sched.expr) {
      const parsed = parseCronExpr(sched.expr);
      if (!parsed) continue;

      const d = new Date(rangeStart);
      while (d.getTime() <= endMs) {
        if (cronMatchesDate(parsed, d)) {
          for (const h of parsed.hours) {
            for (const m of parsed.minutes) {
              const ts = new Date(d.getFullYear(), d.getMonth(), d.getDate(), h, m).getTime();
              if (ts >= startMs && ts <= endMs && ts > now) {
                runs.push({ ts, jobId: job.id, jobName: job.name, projected: true });
              }
            }
          }
        }
        d.setDate(d.getDate() + 1);
      }
    }
  }

  return runs;
}

interface ParsedCron {
  minutes: number[];
  hours: number[];
  daysOfMonth: number[] | null; // null = every day
  months: number[] | null;      // null = every month (1-12)
  daysOfWeek: number[] | null;  // null = every dow (0=Sun..6=Sat)
}

function parseCronExpr(expr: string): ParsedCron | null {
  const parts = expr.trim().split(/\s+/);
  if (parts.length < 5) return null;

  const minutes = parseCronField(parts[0], 0, 59);
  const hours = parseCronField(parts[1], 0, 23);
  if (!minutes || !hours) return null;
  if (minutes.length * hours.length > 200) return null;

  const domRaw = parseCronField(parts[2], 1, 31);
  const monthRaw = parseCronField(parts[3], 1, 12);
  const dowRaw = parseCronField(parts[4], 0, 6);

  const domIsWild = parts[2] === '*';
  const monthIsWild = parts[3] === '*';
  const dowIsWild = parts[4] === '*';

  return {
    minutes,
    hours,
    daysOfMonth: domIsWild ? null : domRaw,
    months: monthIsWild ? null : monthRaw,
    daysOfWeek: dowIsWild ? null : dowRaw,
  };
}

function cronMatchesDate(cron: ParsedCron, date: Date): boolean {
  const m = date.getMonth() + 1; // 1-12
  if (cron.months && !cron.months.includes(m)) return false;

  const dom = date.getDate();
  const dow = date.getDay(); // 0=Sun

  if (cron.daysOfMonth && cron.daysOfWeek) {
    return cron.daysOfMonth.includes(dom) || cron.daysOfWeek.includes(dow);
  }
  if (cron.daysOfMonth && !cron.daysOfMonth.includes(dom)) return false;
  if (cron.daysOfWeek && !cron.daysOfWeek.includes(dow)) return false;

  return true;
}

function parseCronField(field: string, min: number, max: number): number[] | null {
  if (field === '*') {
    const vals: number[] = [];
    for (let i = min; i <= max; i++) vals.push(i);
    return vals;
  }

  const stepMatch = field.match(/^\*\/(\d+)$/);
  if (stepMatch) {
    const step = parseInt(stepMatch[1], 10);
    if (step <= 0) return null;
    const vals: number[] = [];
    for (let i = min; i <= max; i += step) vals.push(i);
    return vals;
  }

  const vals: number[] = [];
  for (const part of field.split(',')) {
    const rangeStepMatch = part.match(/^(\d+)-(\d+)\/(\d+)$/);
    if (rangeStepMatch) {
      const from = parseInt(rangeStepMatch[1], 10);
      const to = parseInt(rangeStepMatch[2], 10);
      const step = parseInt(rangeStepMatch[3], 10);
      if (step <= 0) continue;
      for (let i = from; i <= to && i <= max; i += step) {
        if (i >= min) vals.push(i);
      }
      continue;
    }

    const rangeMatch = part.match(/^(\d+)-(\d+)$/);
    if (rangeMatch) {
      const from = parseInt(rangeMatch[1], 10);
      const to = parseInt(rangeMatch[2], 10);
      for (let i = from; i <= to && i <= max; i++) {
        if (i >= min) vals.push(i);
      }
      continue;
    }

    const n = parseInt(part, 10);
    if (!isNaN(n) && n >= min && n <= max) vals.push(n);
  }
  return vals.length > 0 ? vals : null;
}

function formatSchedule(s: CronJobSchedule): string {
  if (s.kind === 'cron' && s.expr) return s.expr;
  if (s.kind === 'every' && s.everyMs) {
    const mins = Math.round(s.everyMs / 60000);
    if (mins < 60) return `${mins} percenként`;
    const hrs = Math.round(mins / 60);
    return `${hrs} óránként`;
  }
  return JSON.stringify(s);
}

function formatTime(ms: number) {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function formatDateTime(ms: number) {
  const d = new Date(ms);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')} ${formatTime(ms)}`;
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const secs = Math.round(ms / 1000);
  if (secs < 60) return `${secs}s`;
  const mins = Math.floor(secs / 60);
  const remSecs = secs % 60;
  return `${mins}m ${remSecs}s`;
}

export function ScheduleCalendar() {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [selectedDay, setSelectedDay] = useState<number | null>(null);

  const [cronJobs, setCronJobs] = useState<CronJob[]>([]);
  const [cronHistory, setCronHistory] = useState<CronRun[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    Promise.all([
      api.resources.cronJobs().catch(() => []),
      api.resources.cronHistory(60).catch(() => []),
      api.tasks.list().catch(() => []),
    ]).then(([jobs, history, allTasks]) => {
      if (cancelled) return;
      setCronJobs(Array.isArray(jobs) ? jobs : []);
      setCronHistory(Array.isArray(history) ? history : []);
      setTasks(Array.isArray(allTasks) ? allTasks : []);
    }).catch((err) => {
      if (!cancelled) setError(err instanceof Error ? err.message : 'Hiba');
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, []);

  const jobNameMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const j of cronJobs) map.set(j.id, j.name);
    return map;
  }, [cronJobs]);

  const monthStart = useMemo(() => new Date(year, month, 1), [year, month]);
  const monthEnd = useMemo(() => new Date(year, month + 1, 0, 23, 59, 59, 999), [year, month]);

  const projectedRuns = useMemo(
    () => projectFutureRuns(cronJobs, monthStart, monthEnd),
    [cronJobs, monthStart, monthEnd],
  );

  const eventsByDate = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    const addEvent = (key: string, ev: CalendarEvent) => {
      const arr = map.get(key) || [];
      arr.push(ev);
      map.set(key, arr);
    };

    for (const run of cronHistory) {
      addEvent(toDateKey(new Date(run.ts)), { ...run, projected: false as const });
    }
    for (const pr of projectedRuns) {
      addEvent(toDateKey(new Date(pr.ts)), pr);
    }

    return map;
  }, [cronHistory, projectedRuns]);

  const tasksByDate = useMemo(() => {
    const map = new Map<string, Task[]>();
    for (const t of tasks) {
      const dateStr = t.dueAt || t.startAt;
      if (!dateStr) continue;
      const key = toDateKey(new Date(dateStr));
      const arr = map.get(key) || [];
      arr.push(t);
      map.set(key, arr);
    }
    return map;
  }, [tasks]);

  const grid = useMemo(() => getMonthGrid(year, month), [year, month]);
  const todayKey = toDateKey(today);

  const prevMonth = () => {
    if (month === 0) { setYear(year - 1); setMonth(11); }
    else setMonth(month - 1);
    setSelectedDay(null);
  };

  const nextMonth = () => {
    if (month === 11) { setYear(year + 1); setMonth(0); }
    else setMonth(month + 1);
    setSelectedDay(null);
  };

  const goToday = () => {
    setYear(today.getFullYear());
    setMonth(today.getMonth());
    setSelectedDay(today.getDate());
  };

  const selectedDateKey = selectedDay
    ? `${year}-${String(month + 1).padStart(2, '0')}-${String(selectedDay).padStart(2, '0')}`
    : null;

  const selectedDayEvents = selectedDateKey
    ? (eventsByDate.get(selectedDateKey) || []).sort((a, b) => a.ts - b.ts)
    : [];
  const selectedDayTasks = selectedDateKey ? (tasksByDate.get(selectedDateKey) || []) : [];

  const selectedPastRuns = selectedDayEvents.filter((e): e is CronRun & { projected?: false } => !e.projected);
  const selectedFutureRuns = selectedDayEvents.filter((e): e is ProjectedRun => !!e.projected);

  const nextRuns = useMemo(() => {
    return cronJobs
      .filter(j => j.enabled && j.state?.nextRunAtMs)
      .map(j => ({ name: j.name, nextAt: j.state.nextRunAtMs!, agentId: j.agentId }))
      .sort((a, b) => a.nextAt - b.nextAt);
  }, [cronJobs]);

  const monthProjectedTotal = projectedRuns.length;
  const monthJobBreakdown = useMemo(() => {
    const counts = new Map<string, number>();
    for (const pr of projectedRuns) {
      counts.set(pr.jobName, (counts.get(pr.jobName) || 0) + 1);
    }
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
  }, [projectedRuns]);

  return (
    <div className="min-h-screen">
      <header className="border-b border-slate-800 bg-slate-900/50 sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <h1 className="text-xl font-semibold text-slate-100">Ütemezés</h1>
          <div className="flex items-center gap-2">
            <button
              onClick={prevMonth}
              className="p-2 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition-colors"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <button
              onClick={goToday}
              className="px-3 py-1.5 text-sm font-medium text-slate-200 bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors min-w-[160px] text-center"
            >
              {HU_MONTHS[month]} {year}
            </button>
            <button
              onClick={nextMonth}
              className="p-2 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition-colors"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-6">
        {error && (
          <div className="mb-4 p-4 bg-red-900/30 border border-red-800 rounded-lg text-red-300 text-sm">
            {error}
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="animate-pulse text-slate-400">Betöltés...</div>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6">
            {/* Left column: Calendar + detail */}
            <div>
              {/* Calendar grid */}
              <div className="bg-slate-900/60 border border-slate-700 rounded-xl overflow-hidden">
                <div className="grid grid-cols-7">
                  {HU_DAYS.map((d) => (
                    <div key={d} className="px-2 py-2 text-center text-xs font-medium text-slate-500 border-b border-slate-700/50">
                      {d}
                    </div>
                  ))}
                </div>
                <div className="grid grid-cols-7">
                  {grid.map((day, i) => {
                    if (day === null) {
                      return <div key={`empty-${i}`} className="min-h-[72px] border-b border-r border-slate-800/30" />;
                    }
                    const key = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                    const isToday = key === todayKey;
                    const isSelected = day === selectedDay;
                    const dayEvents = eventsByDate.get(key) || [];
                    const dayTasks = tasksByDate.get(key) || [];

                    const pastOk = dayEvents.filter(e => !e.projected && (e as CronRun).status === 'ok').length;
                    const pastErr = dayEvents.filter(e => !e.projected && (e as CronRun).status !== 'ok').length;
                    const futureCount = dayEvents.filter(e => e.projected).length;

                    return (
                      <button
                        key={key}
                        onClick={() => setSelectedDay(day === selectedDay ? null : day)}
                        className={`min-h-[72px] p-1.5 text-left border-b border-r border-slate-800/30 transition-colors hover:bg-slate-800/40 ${
                          isSelected ? 'bg-slate-800/60 ring-1 ring-inset ring-amber-500/40' : ''
                        } ${isToday && !isSelected ? 'ring-1 ring-inset ring-amber-500/30' : ''}`}
                      >
                        <span className={`inline-flex items-center justify-center w-6 h-6 text-xs font-medium rounded-full ${
                          isToday ? 'bg-amber-500 text-slate-900' : 'text-slate-400'
                        }`}>
                          {day}
                        </span>
                        <div className="mt-0.5 flex flex-wrap gap-0.5">
                          {pastOk > 0 && (
                            <span className="flex items-center gap-0.5 text-[10px] text-emerald-400 bg-emerald-500/10 px-1 rounded">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                              {pastOk}
                            </span>
                          )}
                          {pastErr > 0 && (
                            <span className="flex items-center gap-0.5 text-[10px] text-red-400 bg-red-500/10 px-1 rounded">
                              <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
                              {pastErr}
                            </span>
                          )}
                          {futureCount > 0 && (
                            <span className="flex items-center gap-0.5 text-[10px] text-blue-400 bg-blue-500/10 px-1 rounded">
                              <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />
                              {futureCount}
                            </span>
                          )}
                          {dayTasks.length > 0 && (
                            <span className="flex items-center gap-0.5 text-[10px] text-amber-400 bg-amber-500/10 px-1 rounded">
                              <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                              {dayTasks.length}
                            </span>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Selected day detail */}
              {selectedDay && (
                <div className="mt-4 bg-slate-900/60 border border-slate-700 rounded-xl p-4">
                  <h3 className="text-sm font-semibold text-slate-100 mb-3">
                    {year}. {HU_MONTHS[month].toLowerCase()} {selectedDay}.
                  </h3>

                  {selectedPastRuns.length === 0 && selectedFutureRuns.length === 0 && selectedDayTasks.length === 0 && (
                    <p className="text-sm text-slate-500">Nincs esemény ezen a napon.</p>
                  )}

                  {/* Past runs */}
                  {selectedPastRuns.length > 0 && (
                    <div className="mb-4">
                      <h4 className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-2">
                        Lefutott ({selectedPastRuns.length})
                      </h4>
                      <div className="space-y-1.5">
                        {selectedPastRuns.sort((a, b) => b.ts - a.ts).map((run, idx) => {
                          const ok = run.status === 'ok';
                          const name = jobNameMap.get(run.jobId) || run.jobId.slice(0, 8);
                          return (
                            <div key={`past-${run.ts}-${idx}`} className="px-3 py-2 rounded-lg bg-slate-800/40 border border-slate-700/40">
                              <div className="flex items-center gap-3">
                                <span className={`w-2 h-2 rounded-full flex-shrink-0 ${ok ? 'bg-emerald-500' : 'bg-red-500'}`} />
                                <span className="text-sm text-slate-200 flex-1 truncate">{name}</span>
                                <span className="text-xs text-slate-500">{formatTime(run.ts)}</span>
                                {run.durationMs != null && (
                                  <span className="text-[10px] text-slate-500">{formatDuration(run.durationMs)}</span>
                                )}
                                <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                                  ok
                                    ? 'bg-emerald-900/40 text-emerald-400 border border-emerald-700/30'
                                    : 'bg-red-900/40 text-red-400 border border-red-700/30'
                                }`}>
                                  {ok ? 'OK' : run.status}
                                </span>
                              </div>
                              {run.summary && (
                                <p className="mt-1 text-xs text-slate-500 line-clamp-2 pl-5">{run.summary}</p>
                              )}
                              {run.usage && (
                                <div className="mt-1 flex gap-3 pl-5">
                                  <span className="text-[10px] text-slate-600">
                                    {run.usage.total_tokens.toLocaleString()} token
                                  </span>
                                  {run.model && (
                                    <span className="text-[10px] text-slate-600">{run.model}</span>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Future projected runs */}
                  {selectedFutureRuns.length > 0 && (
                    <div className="mb-4">
                      <h4 className="text-xs font-medium text-blue-400 uppercase tracking-wide mb-2">
                        Tervezett futások ({selectedFutureRuns.length})
                      </h4>
                      <div className="space-y-1.5">
                        {selectedFutureRuns.sort((a, b) => a.ts - b.ts).map((run, idx) => (
                          <div key={`proj-${run.ts}-${idx}`} className="px-3 py-2 rounded-lg bg-blue-900/10 border border-blue-800/30">
                            <div className="flex items-center gap-3">
                              <span className="w-2 h-2 rounded-full flex-shrink-0 bg-blue-400 opacity-60" />
                              <span className="text-sm text-slate-300 flex-1 truncate">{run.jobName}</span>
                              <span className="text-xs text-blue-400/80">{formatTime(run.ts)}</span>
                              <span className="text-[10px] px-1.5 py-0.5 rounded font-medium bg-blue-900/30 text-blue-300 border border-blue-700/30">
                                tervezett
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Tasks */}
                  {selectedDayTasks.length > 0 && (
                    <div>
                      <h4 className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-2">
                        Feladatok ({selectedDayTasks.length})
                      </h4>
                      <div className="space-y-1.5">
                        {selectedDayTasks.map((t) => (
                          <div key={t.id} className="flex items-center gap-3 px-3 py-2 rounded-lg bg-slate-800/40 border border-slate-700/40">
                            <span className="w-2 h-2 rounded-full flex-shrink-0 bg-amber-500" />
                            <span className="text-sm text-slate-200 flex-1 truncate">
                              #{t.shortId} {t.title}
                            </span>
                            <span className="text-[10px] px-1.5 py-0.5 rounded font-medium bg-slate-800/80 text-slate-400 border border-slate-700/50">
                              {t.status}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Right column: Sidebar panels */}
            <div className="space-y-4">
              {/* Month projection summary */}
              <div className="bg-slate-900/60 border border-slate-700 rounded-xl overflow-hidden">
                <div className="px-4 py-3 border-b border-slate-700/50">
                  <h2 className="text-xs font-semibold text-slate-300 uppercase tracking-wide">
                    Havi előrejelzés
                  </h2>
                </div>
                <div className="px-4 py-3">
                  <div className="flex items-baseline gap-2 mb-3">
                    <span className="text-2xl font-bold text-blue-400">{monthProjectedTotal}</span>
                    <span className="text-xs text-slate-500">tervezett futás ebben a hónapban</span>
                  </div>
                  {monthJobBreakdown.length > 0 && (
                    <div className="space-y-1.5">
                      {monthJobBreakdown.map(([name, count]) => (
                        <div key={name} className="flex items-center justify-between">
                          <span className="text-xs text-slate-400 truncate flex-1 mr-2">{name}</span>
                          <span className="text-xs font-mono text-blue-300">{count}×</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Next scheduled runs */}
              {nextRuns.length > 0 && (
                <div className="bg-slate-900/60 border border-slate-700 rounded-xl overflow-hidden">
                  <div className="px-4 py-3 border-b border-slate-700/50">
                    <h2 className="text-xs font-semibold text-slate-300 uppercase tracking-wide">
                      Következő futások
                    </h2>
                  </div>
                  <div className="divide-y divide-slate-700/30">
                    {nextRuns.slice(0, 8).map((r, idx) => (
                      <div key={`${r.name}-${idx}`} className="px-4 py-2.5 flex items-center gap-3">
                        <span className="w-1.5 h-1.5 rounded-full bg-blue-400 flex-shrink-0 animate-pulse" />
                        <div className="min-w-0 flex-1">
                          <p className="text-xs text-slate-300 truncate">{r.name}</p>
                          <p className="text-[10px] text-slate-500">{formatDateTime(r.nextAt)}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* All cron jobs */}
              <div className="bg-slate-900/60 border border-slate-700 rounded-xl overflow-hidden">
                <div className="px-4 py-3 border-b border-slate-700/50">
                  <h2 className="text-xs font-semibold text-slate-300 uppercase tracking-wide">
                    Cron feladatok ({cronJobs.length})
                  </h2>
                </div>
                {cronJobs.length === 0 ? (
                  <div className="px-4 py-6 text-center text-sm text-slate-500">
                    Nincsenek cron feladatok.
                  </div>
                ) : (
                  <div className="divide-y divide-slate-700/30">
                    {cronJobs.map((job) => {
                      const lastOk = job.state?.lastRunStatus === 'ok' || job.state?.lastStatus === 'ok';
                      return (
                        <div key={job.id} className="px-4 py-3">
                          <div className="flex items-center gap-2 mb-1">
                            <span className={`w-2 h-2 rounded-full flex-shrink-0 ${
                              job.enabled ? 'bg-emerald-500' : 'bg-slate-600'
                            }`} />
                            <span className="text-xs font-medium text-slate-200 truncate flex-1">
                              {job.name}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 pl-4">
                            <code className="text-[10px] text-slate-400 bg-slate-800 px-1.5 py-0.5 rounded font-mono">
                              {formatSchedule(job.schedule)}
                            </code>
                            {!job.enabled && (
                              <span className="text-[10px] text-slate-600">kikapcsolva</span>
                            )}
                          </div>
                          {job.state?.lastRunAtMs && (
                            <div className="flex items-center gap-2 pl-4 mt-1">
                              <span className="text-[10px] text-slate-500">
                                Utoljára: {formatDateTime(job.state.lastRunAtMs)}
                              </span>
                              <span className={`text-[10px] font-medium ${lastOk ? 'text-emerald-400' : 'text-red-400'}`}>
                                {lastOk ? 'OK' : (job.state.lastStatus || job.state.lastRunStatus || '?')}
                              </span>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Legend */}
              <div className="bg-slate-900/60 border border-slate-700 rounded-xl px-4 py-3">
                <h2 className="text-xs font-semibold text-slate-300 uppercase tracking-wide mb-2">Jelmagyarázat</h2>
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2 text-xs text-slate-400">
                    <span className="w-2 h-2 rounded-full bg-emerald-500" /> Sikeres futás (múlt)
                  </div>
                  <div className="flex items-center gap-2 text-xs text-slate-400">
                    <span className="w-2 h-2 rounded-full bg-red-500" /> Hibás futás (múlt)
                  </div>
                  <div className="flex items-center gap-2 text-xs text-slate-400">
                    <span className="w-2 h-2 rounded-full bg-blue-400" /> Tervezett futás (jövő)
                  </div>
                  <div className="flex items-center gap-2 text-xs text-slate-400">
                    <span className="w-2 h-2 rounded-full bg-amber-500" /> Feladat (határidő/kezdés)
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
