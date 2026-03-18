import { useEffect, useMemo, useState } from 'react';
import { api } from '../api';
import type { Task, Project } from '../types';

type Period = 'week' | 'month' | 'year';

const PERIOD_LABELS: Record<Period, string> = {
  week: 'Heti',
  month: 'Havi',
  year: 'Éves',
};

const PRIORITY_LABELS: Record<string, string> = {
  critical: 'Kritikus',
  high: 'Magas',
  medium: 'Közepes',
  low: 'Alacsony',
};

const PRIORITY_COLORS: Record<string, string> = {
  critical: 'bg-red-500/20 text-red-400 border-red-500/30',
  high: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
  medium: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  low: 'bg-slate-500/20 text-slate-400 border-slate-500/30',
};

const STATUS_COLORS: Record<string, string> = {
  'Beérkező': 'bg-slate-600',
  'Teendő': 'bg-blue-500',
  'Folyamatban': 'bg-amber-500',
  'Várakozás': 'bg-purple-500',
  'Felülvizsgálat': 'bg-cyan-500',
  'Kész': 'bg-emerald-500',
};

function getPeriodRange(period: Period, offset: number): { start: Date; end: Date; label: string } {
  const now = new Date();

  if (period === 'week') {
    const dayOfWeek = now.getDay() || 7;
    const monday = new Date(now);
    monday.setDate(now.getDate() - dayOfWeek + 1 + offset * 7);
    monday.setHours(0, 0, 0, 0);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    sunday.setHours(23, 59, 59, 999);

    const fmt = (d: Date) =>
      `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
    return { start: monday, end: sunday, label: `${fmt(monday)} – ${fmt(sunday)}` };
  }

  if (period === 'month') {
    const d = new Date(now.getFullYear(), now.getMonth() + offset, 1);
    const end = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);
    const monthNames = [
      'Január', 'Február', 'Március', 'Április', 'Május', 'Június',
      'Július', 'Augusztus', 'Szeptember', 'Október', 'November', 'December',
    ];
    return { start: d, end, label: `${d.getFullYear()} ${monthNames[d.getMonth()]}` };
  }

  const year = now.getFullYear() + offset;
  return {
    start: new Date(year, 0, 1),
    end: new Date(year, 11, 31, 23, 59, 59, 999),
    label: `${year}`,
  };
}

function daysBetween(a: Date, b: Date): number {
  return Math.max(0, Math.round((b.getTime() - a.getTime()) / 86_400_000));
}

function formatDuration(hours: number): string {
  if (hours < 24) return `${Math.round(hours)}h`;
  const days = Math.floor(hours / 24);
  const h = Math.round(hours % 24);
  return h > 0 ? `${days}n ${h}h` : `${days}n`;
}

export function Reports() {
  const [period, setPeriod] = useState<Period>('week');
  const [offset, setOffset] = useState(0);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedProject, setExpandedProject] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    Promise.all([api.tasks.list(), api.projects.list()])
      .then(([t, p]) => {
        setTasks(t);
        setProjects(p);
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    setOffset(0);
  }, [period]);

  const { start, end, label } = useMemo(() => getPeriodRange(period, offset), [period, offset]);

  const projectMap = useMemo(() => {
    const m = new Map<string, Project>();
    projects.forEach((p) => m.set(p.id, p));
    return m;
  }, [projects]);

  const completedInPeriod = useMemo(
    () =>
      tasks.filter((t) => {
        if (t.status !== 'Kész') return false;
        const closed = t.closedAt ? new Date(t.closedAt) : null;
        if (!closed) return false;
        return closed >= start && closed <= end;
      }),
    [tasks, start, end],
  );

  const prevRange = useMemo(() => getPeriodRange(period, offset - 1), [period, offset]);
  const completedInPrev = useMemo(
    () =>
      tasks.filter((t) => {
        if (t.status !== 'Kész') return false;
        const closed = t.closedAt ? new Date(t.closedAt) : null;
        if (!closed) return false;
        return closed >= prevRange.start && closed <= prevRange.end;
      }),
    [tasks, prevRange],
  );

  const createdInPeriod = useMemo(
    () =>
      tasks.filter((t) => {
        const created = new Date(t.createdAt);
        return created >= start && created <= end;
      }),
    [tasks, start, end],
  );

  const inProgressNow = useMemo(
    () => tasks.filter((t) => t.status === 'Folyamatban'),
    [tasks],
  );

  const avgCompletionHours = useMemo(() => {
    const durations = completedInPeriod
      .filter((t) => t.createdAt && t.closedAt)
      .map((t) => (new Date(t.closedAt!).getTime() - new Date(t.createdAt).getTime()) / 3_600_000);
    if (durations.length === 0) return 0;
    return durations.reduce((a, b) => a + b, 0) / durations.length;
  }, [completedInPeriod]);

  const byProject = useMemo(() => {
    const m = new Map<string, Task[]>();
    completedInPeriod.forEach((t) => {
      const arr = m.get(t.projectId) || [];
      arr.push(t);
      m.set(t.projectId, arr);
    });
    return [...m.entries()]
      .map(([pid, tasks]) => ({ project: projectMap.get(pid), tasks }))
      .sort((a, b) => b.tasks.length - a.tasks.length);
  }, [completedInPeriod, projectMap]);

  const byPriority = useMemo(() => {
    const counts: Record<string, number> = { critical: 0, high: 0, medium: 0, low: 0 };
    completedInPeriod.forEach((t) => {
      counts[t.priority] = (counts[t.priority] || 0) + 1;
    });
    return counts;
  }, [completedInPeriod]);

  const bySource = useMemo(() => {
    const counts: Record<string, number> = {};
    completedInPeriod.forEach((t) => {
      const src = t.sourceType || 'ismeretlen';
      counts[src] = (counts[src] || 0) + 1;
    });
    return counts;
  }, [completedInPeriod]);

  const allStatusCounts = useMemo(() => {
    const m: Record<string, number> = {};
    tasks.forEach((t) => {
      m[t.status] = (m[t.status] || 0) + 1;
    });
    return m;
  }, [tasks]);

  const dailyCompletions = useMemo(() => {
    const periodDays = daysBetween(start, end) + 1;
    const bucketCount = period === 'year' ? 12 : periodDays;
    const buckets: { label: string; count: number }[] = [];

    if (period === 'year') {
      const monthNames = ['Jan', 'Feb', 'Már', 'Ápr', 'Máj', 'Jún', 'Júl', 'Aug', 'Sze', 'Okt', 'Nov', 'Dec'];
      for (let i = 0; i < 12; i++) {
        buckets.push({ label: monthNames[i], count: 0 });
      }
      completedInPeriod.forEach((t) => {
        const m = new Date(t.closedAt!).getMonth();
        buckets[m].count++;
      });
    } else {
      for (let i = 0; i < bucketCount; i++) {
        const d = new Date(start);
        d.setDate(start.getDate() + i);
        const dayLabel =
          period === 'week'
            ? ['H', 'K', 'Sze', 'Cs', 'P', 'Szo', 'V'][d.getDay() === 0 ? 6 : d.getDay() - 1]
            : `${d.getDate()}`;
        buckets.push({ label: dayLabel, count: 0 });
      }
      completedInPeriod.forEach((t) => {
        const closed = new Date(t.closedAt!);
        const idx = daysBetween(start, closed);
        if (idx >= 0 && idx < buckets.length) buckets[idx].count++;
      });
    }
    return buckets;
  }, [completedInPeriod, start, end, period]);

  const maxDaily = Math.max(1, ...dailyCompletions.map((d) => d.count));

  const trendPct = useMemo(() => {
    if (completedInPrev.length === 0) return completedInPeriod.length > 0 ? 100 : 0;
    return Math.round(((completedInPeriod.length - completedInPrev.length) / completedInPrev.length) * 100);
  }, [completedInPeriod, completedInPrev]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="w-8 h-8 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-xl font-semibold text-slate-100">Jelentések</h1>
          <p className="text-sm text-slate-400 mt-0.5">Elvégzett feladatok összefoglalója</p>
        </div>

        <div className="flex items-center gap-2">
          {/* Period selector */}
          <div className="flex bg-slate-900 border border-slate-700 rounded-lg p-0.5">
            {(['week', 'month', 'year'] as Period[]).map((p) => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                  period === p
                    ? 'bg-amber-600 text-white'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {PERIOD_LABELS[p]}
              </button>
            ))}
          </div>

          {/* Period navigation */}
          <div className="flex items-center gap-1">
            <button
              onClick={() => setOffset((o) => o - 1)}
              className="w-8 h-8 flex items-center justify-center rounded-lg bg-slate-900 border border-slate-700 text-slate-400 hover:text-slate-200 hover:border-slate-600 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <span className="text-sm font-medium text-slate-200 min-w-[160px] text-center">{label}</span>
            <button
              onClick={() => setOffset((o) => o + 1)}
              disabled={offset >= 0}
              className={`w-8 h-8 flex items-center justify-center rounded-lg bg-slate-900 border border-slate-700 transition-colors ${
                offset >= 0
                  ? 'text-slate-600 cursor-not-allowed'
                  : 'text-slate-400 hover:text-slate-200 hover:border-slate-600'
              }`}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
            {offset !== 0 && (
              <button
                onClick={() => setOffset(0)}
                className="ml-1 px-2 py-1.5 text-xs text-amber-500 hover:text-amber-400 transition-colors"
              >
                Ma
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <SummaryCard
          title="Elvégzett feladatok"
          value={completedInPeriod.length}
          trend={trendPct}
          subtitle={`előző: ${completedInPrev.length}`}
        />
        <SummaryCard
          title="Új feladatok"
          value={createdInPeriod.length}
          color="blue"
        />
        <SummaryCard
          title="Átl. teljesítési idő"
          value={avgCompletionHours > 0 ? formatDuration(avgCompletionHours) : '–'}
          color="purple"
        />
        <SummaryCard
          title="Jelenleg folyamatban"
          value={inProgressNow.length}
          color="amber"
        />
      </div>

      {/* Chart + Priority breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
        {/* Mini bar chart */}
        <div className="lg:col-span-2 bg-slate-900/60 border border-slate-700 rounded-xl p-4">
          <h3 className="text-sm font-medium text-slate-300 mb-3">
            Elvégzett feladatok ({period === 'year' ? 'havi' : 'napi'} bontásban)
          </h3>
          <div className="flex items-end gap-[2px] h-32">
            {dailyCompletions.map((d, i) => (
              <div key={i} className="flex-1 flex flex-col items-center justify-end h-full group relative">
                <div
                  className="w-full bg-amber-500/70 rounded-t transition-all group-hover:bg-amber-400"
                  style={{ height: `${Math.max(d.count > 0 ? 8 : 0, (d.count / maxDaily) * 100)}%` }}
                />
                {(period !== 'month' || i % Math.ceil(dailyCompletions.length / 15) === 0) && (
                  <span className="text-[9px] text-slate-500 mt-1 leading-none">{d.label}</span>
                )}
                {d.count > 0 && (
                  <div className="absolute -top-6 left-1/2 -translate-x-1/2 px-1.5 py-0.5 bg-slate-800 border border-slate-700 rounded text-[10px] text-slate-200 opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap transition-opacity z-10">
                    {d.count} feladat
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Priority breakdown */}
        <div className="bg-slate-900/60 border border-slate-700 rounded-xl p-4">
          <h3 className="text-sm font-medium text-slate-300 mb-3">Prioritás szerinti bontás</h3>
          <div className="space-y-2">
            {(['critical', 'high', 'medium', 'low'] as const).map((p) => {
              const count = byPriority[p] || 0;
              const pct = completedInPeriod.length > 0 ? (count / completedInPeriod.length) * 100 : 0;
              return (
                <div key={p}>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="text-slate-400">{PRIORITY_LABELS[p]}</span>
                    <span className="text-slate-300 font-medium">{count}</span>
                  </div>
                  <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${
                        p === 'critical'
                          ? 'bg-red-500'
                          : p === 'high'
                            ? 'bg-orange-500'
                            : p === 'medium'
                              ? 'bg-amber-500'
                              : 'bg-slate-500'
                      }`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>

          {/* Source breakdown */}
          <h3 className="text-sm font-medium text-slate-300 mt-5 mb-2">Forrás szerinti bontás</h3>
          <div className="flex flex-wrap gap-2">
            {Object.entries(bySource).map(([src, count]) => (
              <span
                key={src}
                className="text-[10px] px-2 py-0.5 rounded border border-slate-600 bg-slate-800/60 text-slate-300"
              >
                {src === 'agent' ? 'Agent' : src === 'manual' ? 'Kézi' : src} ({count})
              </span>
            ))}
          </div>

          {/* Current pipeline snapshot */}
          <h3 className="text-sm font-medium text-slate-300 mt-5 mb-2">Pipeline állapot</h3>
          <div className="space-y-1.5">
            {Object.entries(allStatusCounts)
              .sort(
                ([a], [b]) =>
                  ['Beérkező', 'Teendő', 'Folyamatban', 'Várakozás', 'Felülvizsgálat', 'Kész'].indexOf(a) -
                  ['Beérkező', 'Teendő', 'Folyamatban', 'Várakozás', 'Felülvizsgálat', 'Kész'].indexOf(b),
              )
              .map(([status, count]) => (
                <div key={status} className="flex items-center gap-2 text-xs">
                  <span className={`w-2 h-2 rounded-full ${STATUS_COLORS[status] || 'bg-slate-500'}`} />
                  <span className="text-slate-400 flex-1">{status}</span>
                  <span className="text-slate-300 font-medium">{count}</span>
                </div>
              ))}
          </div>
        </div>
      </div>

      {/* Project breakdown */}
      <div className="bg-slate-900/60 border border-slate-700 rounded-xl p-4 mb-6">
        <h3 className="text-sm font-medium text-slate-300 mb-3">Projekt szerinti bontás</h3>
        {byProject.length === 0 ? (
          <p className="text-sm text-slate-500">Nincs elvégzett feladat ebben az időszakban.</p>
        ) : (
          <div className="space-y-2">
            {byProject.map(({ project, tasks: projTasks }) => {
              const isExpanded = expandedProject === (project?.id || 'unknown');
              const projColor = project?.color || '#64748b';
              return (
                <div key={project?.id || 'unknown'}>
                  <button
                    onClick={() =>
                      setExpandedProject(isExpanded ? null : project?.id || 'unknown')
                    }
                    className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-slate-800/60 transition-colors group"
                  >
                    <span
                      className="w-3 h-3 rounded-full flex-shrink-0"
                      style={{ backgroundColor: projColor }}
                    />
                    <span className="text-sm text-slate-200 flex-1 text-left">
                      {project?.name || 'Ismeretlen projekt'}
                    </span>
                    <span className="text-sm font-semibold text-slate-100">{projTasks.length}</span>
                    <svg
                      className={`w-4 h-4 text-slate-500 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>

                  {isExpanded && (
                    <div className="ml-6 mt-1 space-y-1 border-l border-slate-700 pl-3">
                      {projTasks
                        .sort(
                          (a, b) =>
                            new Date(b.closedAt!).getTime() - new Date(a.closedAt!).getTime(),
                        )
                        .map((t) => {
                          const closedDate = new Date(t.closedAt!);
                          const createdDate = new Date(t.createdAt);
                          const durationH =
                            (closedDate.getTime() - createdDate.getTime()) / 3_600_000;
                          return (
                            <div
                              key={t.id}
                              className="flex items-center gap-2 py-1.5 px-2 rounded text-xs hover:bg-slate-800/40 transition-colors"
                            >
                              <span
                                className={`inline-flex px-1.5 py-0.5 rounded border text-[10px] font-medium ${
                                  PRIORITY_COLORS[t.priority] || PRIORITY_COLORS.medium
                                }`}
                              >
                                {PRIORITY_LABELS[t.priority] || t.priority}
                              </span>
                              <span className="text-slate-300 flex-1 truncate" title={t.title}>
                                {t.title}
                              </span>
                              {t.assignee?.name && (
                                <span className="text-slate-500 hidden sm:inline">
                                  {t.assignee.name}
                                </span>
                              )}
                              <span className="text-slate-500 whitespace-nowrap">
                                {formatDuration(durationH)}
                              </span>
                              <span className="text-slate-600 whitespace-nowrap">
                                {closedDate.getMonth() + 1}.{closedDate.getDate()}.
                              </span>
                            </div>
                          );
                        })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Recent completions list */}
      {completedInPeriod.length > 0 && (
        <div className="bg-slate-900/60 border border-slate-700 rounded-xl p-4">
          <h3 className="text-sm font-medium text-slate-300 mb-3">
            Összes elvégzett feladat ({completedInPeriod.length})
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-slate-500 border-b border-slate-800">
                  <th className="pb-2 pr-3 font-medium">#</th>
                  <th className="pb-2 pr-3 font-medium">Feladat</th>
                  <th className="pb-2 pr-3 font-medium hidden sm:table-cell">Projekt</th>
                  <th className="pb-2 pr-3 font-medium hidden md:table-cell">Prioritás</th>
                  <th className="pb-2 pr-3 font-medium hidden md:table-cell">Forrás</th>
                  <th className="pb-2 pr-3 font-medium">Lezárva</th>
                  <th className="pb-2 font-medium hidden lg:table-cell">Időtartam</th>
                </tr>
              </thead>
              <tbody>
                {completedInPeriod
                  .sort(
                    (a, b) =>
                      new Date(b.closedAt!).getTime() - new Date(a.closedAt!).getTime(),
                  )
                  .map((t) => {
                    const proj = projectMap.get(t.projectId);
                    const closedDate = new Date(t.closedAt!);
                    const durationH =
                      (closedDate.getTime() - new Date(t.createdAt).getTime()) / 3_600_000;
                    return (
                      <tr
                        key={t.id}
                        className="border-b border-slate-800/50 hover:bg-slate-800/30 transition-colors"
                      >
                        <td className="py-2 pr-3 text-slate-500">#{t.shortId}</td>
                        <td className="py-2 pr-3 text-slate-200 max-w-[200px] sm:max-w-[300px] truncate">
                          {t.title}
                        </td>
                        <td className="py-2 pr-3 hidden sm:table-cell">
                          <span className="flex items-center gap-1.5 text-slate-400">
                            {proj?.color && (
                              <span
                                className="w-2 h-2 rounded-full flex-shrink-0"
                                style={{ backgroundColor: proj.color }}
                              />
                            )}
                            <span className="truncate max-w-[120px]">{proj?.name || '–'}</span>
                          </span>
                        </td>
                        <td className="py-2 pr-3 hidden md:table-cell">
                          <span
                            className={`inline-flex px-1.5 py-0.5 rounded border text-[10px] font-medium ${
                              PRIORITY_COLORS[t.priority] || PRIORITY_COLORS.medium
                            }`}
                          >
                            {PRIORITY_LABELS[t.priority] || t.priority}
                          </span>
                        </td>
                        <td className="py-2 pr-3 text-slate-500 hidden md:table-cell">
                          {t.sourceType === 'agent' ? 'Agent' : t.sourceType === 'manual' ? 'Kézi' : t.sourceType}
                        </td>
                        <td className="py-2 pr-3 text-slate-400 whitespace-nowrap">
                          {closedDate.getFullYear()}.
                          {String(closedDate.getMonth() + 1).padStart(2, '0')}.
                          {String(closedDate.getDate()).padStart(2, '0')}.
                        </td>
                        <td className="py-2 text-slate-500 hidden lg:table-cell">
                          {formatDuration(durationH)}
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function SummaryCard({
  title,
  value,
  trend,
  subtitle,
  color = 'emerald',
}: {
  title: string;
  value: number | string;
  trend?: number;
  subtitle?: string;
  color?: 'emerald' | 'blue' | 'purple' | 'amber';
}) {
  const accents: Record<string, string> = {
    emerald: 'text-emerald-400',
    blue: 'text-blue-400',
    purple: 'text-purple-400',
    amber: 'text-amber-400',
  };

  return (
    <div className="bg-slate-900/60 border border-slate-700 rounded-xl p-4">
      <p className="text-xs text-slate-500 mb-1">{title}</p>
      <div className="flex items-baseline gap-2">
        <span className={`text-2xl font-bold ${accents[color]}`}>{value}</span>
        {trend !== undefined && trend !== 0 && (
          <span
            className={`text-xs font-medium ${trend > 0 ? 'text-emerald-400' : 'text-red-400'}`}
          >
            {trend > 0 ? '↑' : '↓'} {Math.abs(trend)}%
          </span>
        )}
      </div>
      {subtitle && <p className="text-[10px] text-slate-600 mt-0.5">{subtitle}</p>}
    </div>
  );
}
