import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api';
import type { Project, SubProject } from '../types';

function PriorityBadge({ priority }: { priority: number }) {
  const p = priority ?? 5;
  const color =
    p >= 8
      ? 'text-red-400 bg-red-900/40 border-red-700/40'
      : p >= 5
        ? 'text-amber-400 bg-amber-900/30 border-amber-700/30'
        : 'text-slate-400 bg-slate-800/60 border-slate-700/40';
  return (
    <span
      className={`inline-flex items-center px-1.5 py-0.5 text-[10px] font-bold rounded border ${color}`}
      title={`Prioritás: ${p}/10`}
    >
      P{p}
    </span>
  );
}

function ProgressBar({ progress, color }: { progress: number; color: string }) {
  return (
    <div className="w-full h-1.5 bg-slate-700/60 rounded-full overflow-hidden">
      <div
        className="h-full rounded-full transition-all duration-500"
        style={{ width: `${progress}%`, backgroundColor: color || '#3b82f6' }}
      />
    </div>
  );
}

const PLANNING_STATUS_CONFIG: Record<string, { label: string; class: string; canTrigger: boolean }> = {
  none: { label: '', class: '', canTrigger: false },
  pending: { label: 'Várakozik', class: 'bg-yellow-900/40 text-yellow-400 border-yellow-700/30', canTrigger: true },
  triggered: { label: 'Triggerelve', class: 'bg-blue-900/40 text-blue-400 border-blue-700/30', canTrigger: false },
  in_progress: { label: 'Tervezés...', class: 'bg-amber-900/40 text-amber-400 border-amber-700/30 animate-pulse', canTrigger: false },
  completed: { label: 'Megtervezve', class: 'bg-emerald-900/40 text-emerald-400 border-emerald-700/30', canTrigger: false },
  failed: { label: 'Sikertelen', class: 'bg-red-900/40 text-red-400 border-red-700/30', canTrigger: true },
};

function SubProjectCard({ sp, projectId, onReload }: { sp: SubProject; projectId: string; onReload: () => void }) {
  const [triggering, setTriggering] = useState(false);
  const color = sp.color || '#3b82f6';
  const planCfg = PLANNING_STATUS_CONFIG[sp.planningStatus] || PLANNING_STATUS_CONFIG.none;
  const hasRequirements = !!(sp.requirements?.trim());
  const showTrigger = hasRequirements && (planCfg.canTrigger || sp.planningStatus === 'none');

  const handleTrigger = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setTriggering(true);
    try {
      await api.projects.triggerPlanning(sp.id);
      onReload();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Hiba');
    } finally {
      setTriggering(false);
    }
  };

  return (
    <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-slate-800/40 hover:bg-slate-800/70 border border-slate-700/40 hover:border-slate-600/60 transition-all group/sp">
      <Link
        to={`/project/${projectId}?subProject=${sp.id}`}
        className="flex items-center gap-3 min-w-0 flex-1"
      >
        <div
          className="w-2 h-8 rounded-full flex-shrink-0"
          style={{ backgroundColor: color }}
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium text-slate-200 truncate">
              {sp.name}
            </span>
            {sp.status === 'completed' && (
              <span className="text-[10px] px-1.5 py-0.5 bg-emerald-900/40 text-emerald-400 border border-emerald-700/30 rounded font-medium">
                Kész
              </span>
            )}
            {planCfg.label && (
              <span className={`text-[10px] px-1.5 py-0.5 border rounded font-medium ${planCfg.class}`}>
                {planCfg.label}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 mt-1">
            <ProgressBar progress={sp.progress ?? 0} color={color} />
            <span className="text-[10px] text-slate-500 font-medium tabular-nums flex-shrink-0">
              {sp.progress ?? 0}%
            </span>
          </div>
        </div>
        <span className="text-[10px] text-slate-500 flex-shrink-0">
          {sp.taskCount ?? 0} feladat
        </span>
      </Link>
      {showTrigger && (
        <button
          onClick={handleTrigger}
          disabled={triggering}
          className="flex-shrink-0 p-1.5 rounded-md bg-amber-600/20 hover:bg-amber-600/40 border border-amber-600/30 text-amber-400 hover:text-amber-300 transition-colors disabled:opacity-50"
          title={sp.planningStatus === 'failed' ? 'Újra triggerelés' : 'Tervezés indítása'}
        >
          {triggering ? (
            <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          ) : (
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          )}
        </button>
      )}
    </div>
  );
}

function NewSubProjectForm({
  projectId,
  onCreated,
  onCancel,
}: {
  projectId: string;
  onCreated: () => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState('');
  const [requirements, setRequirements] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    try {
      await api.projects.createSubProject(projectId, {
        name: name.trim(),
        requirements: requirements.trim() || undefined,
      });
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Hiba');
    }
  };

  return (
    <form onSubmit={handleSubmit} className="px-3 py-3 space-y-2 border-t border-slate-700/30">
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Új projekt neve..."
        className="w-full px-3 py-1.5 bg-slate-800 border border-slate-600 rounded-lg text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50"
        autoFocus
      />
      <textarea
        value={requirements}
        onChange={(e) => setRequirements(e.target.value)}
        placeholder="Követelményleírás (opcionális)... — ha kitöltöd, Sophon automatikusan megtervezi a projektet"
        rows={4}
        className="w-full px-3 py-1.5 bg-slate-800 border border-slate-600 rounded-lg text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50 resize-y"
      />
      {requirements.trim() && (
        <div className="flex items-center gap-1.5 px-2 py-1 bg-amber-900/20 border border-amber-700/30 rounded text-[10px] text-amber-400">
          <svg className="w-3 h-3 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          Mentéskor Sophon automatikusan tervezi meg a projektet a követelmények alapján
        </div>
      )}
      <div className="flex gap-2">
        <button
          type="submit"
          className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium rounded-lg"
        >
          Létrehozás
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="text-slate-400 hover:text-slate-200 text-xs"
        >
          Mégse
        </button>
        {error && <span className="text-red-400 text-xs ml-2">{error}</span>}
      </div>
    </form>
  );
}

export function ProjectList() {
  const navigate = useNavigate();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showNew, setShowNew] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [addingSubTo, setAddingSubTo] = useState<string | null>(null);

  const load = async () => {
    try {
      setError('');
      const data = await api.projects.list();
      setProjects(data);
      const groupsWithSubs = new Set(
        data.filter((p) => (p.subProjectCount ?? 0) > 0 || (p.subProjects?.length ?? 0) > 0).map((p) => p.id)
      );
      setExpandedGroups((prev) => {
        const merged = new Set(prev);
        groupsWithSubs.forEach((id) => merged.add(id));
        return merged;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Hiba');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    try {
      await api.projects.create({ name: newName.trim(), description: newDesc.trim() || undefined });
      setNewName('');
      setNewDesc('');
      setShowNew(false);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Hiba');
    }
  };

  const toggleExpand = (id: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-pulse text-slate-400">Betöltés...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <header className="border-b border-slate-800 bg-slate-900/50 sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <h1 className="text-xl font-semibold text-slate-100">Mission Control</h1>
          <button
            onClick={() => setShowNew(!showNew)}
            className="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white text-sm font-medium rounded-lg transition-colors"
          >
            + Új projektcsoport
          </button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-8">
        {error && (
          <div className="mb-4 p-4 bg-red-900/30 border border-red-800 rounded-lg text-red-300 text-sm">
            {error}
          </div>
        )}

        {showNew && (
          <form
            onSubmit={handleCreate}
            className="mb-6 p-4 bg-slate-900/60 border border-slate-700 rounded-xl"
          >
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Projektcsoport neve"
              className="w-full px-4 py-2 bg-slate-800 border border-slate-600 rounded-lg text-slate-100 mb-2 focus:outline-none focus:ring-2 focus:ring-amber-500/50"
              autoFocus
            />
            <input
              value={newDesc}
              onChange={(e) => setNewDesc(e.target.value)}
              placeholder="Leírás (opcionális)"
              className="w-full px-4 py-2 bg-slate-800 border border-slate-600 rounded-lg text-slate-100 mb-3 focus:outline-none focus:ring-2 focus:ring-amber-500/50"
            />
            <div className="flex gap-2">
              <button
                type="submit"
                className="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white text-sm font-medium rounded-lg"
              >
                Létrehozás
              </button>
              <button
                type="button"
                onClick={() => setShowNew(false)}
                className="px-4 py-2 text-slate-400 hover:text-slate-200 text-sm"
              >
                Mégse
              </button>
            </div>
          </form>
        )}

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((p) => {
            const color = p.color || '#f59e0b';
            const isExpanded = expandedGroups.has(p.id);
            const subProjects = p.subProjects || [];
            const hasSubProjects = subProjects.length > 0;
            return (
              <div
                key={p.id}
                className="relative bg-slate-900/60 border border-slate-700 rounded-xl hover:border-amber-600/50 hover:bg-slate-900/80 transition-colors overflow-hidden group"
              >
                <Link to={`/project/${p.id}`} className="block">
                  <div
                    className="h-1.5 w-full"
                    style={{ backgroundColor: color }}
                  />
                  <div className="p-4">
                    <div className="flex items-center gap-3">
                      <div
                        className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 overflow-hidden"
                        style={{ backgroundColor: color + '25' }}
                      >
                        {p.image ? (
                          <img
                            src={p.image}
                            alt=""
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <span
                            className="text-lg font-bold"
                            style={{ color }}
                          >
                            {p.name.charAt(0).toUpperCase()}
                          </span>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <h2 className="font-medium text-slate-100 truncate">
                            {p.name}
                          </h2>
                          <PriorityBadge priority={p.priority} />
                          <span className="text-[10px] px-1.5 py-0.5 bg-slate-800/80 text-slate-500 border border-slate-700/50 rounded font-medium">
                            csoport
                          </span>
                        </div>
                        {p.description && (
                          <p className="text-sm text-slate-400 line-clamp-1">
                            {p.description}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="mt-2 flex gap-3 text-xs text-slate-500">
                      {(p.subProjectCount ?? subProjects.length) > 0 && (
                        <span>{p.subProjectCount ?? subProjects.length} projekt</span>
                      )}
                      {(p.memberCount ?? 0) > 0 && (
                        <span>{p.memberCount} tag</span>
                      )}
                      {(p.contactCount ?? 0) > 0 && (
                        <span>{p.contactCount} kapcsolat</span>
                      )}
                    </div>

                    {p.activeAssignees && p.activeAssignees.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {p.activeAssignees.map((a) => {
                          const isHuman = a.role === 'user';
                          const badgeClass = isHuman
                            ? 'bg-orange-900/60 text-orange-200 border-2 border-orange-500/70 shadow-[0_0_8px_rgba(249,115,22,0.4)] animate-status-blink-urgent'
                            : a.hasInProgress
                              ? 'bg-emerald-900/50 text-emerald-300 border border-emerald-600/50 animate-status-blink'
                              : 'bg-red-900/50 text-red-300 border border-red-600/50 animate-status-blink';
                          const dotClass = isHuman
                            ? 'bg-orange-400'
                            : a.hasInProgress
                              ? 'bg-emerald-400'
                              : 'bg-red-400';
                          return (
                            <span
                              key={a.id}
                              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${badgeClass}`}
                            >
                              <span
                                className={`w-2 h-2 rounded-full ${dotClass}`}
                              />
                              {a.name}
                            </span>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </Link>

                {/* Sub-projects section */}
                {(hasSubProjects || addingSubTo === p.id) && (
                  <div className="border-t border-slate-700/50">
                    {hasSubProjects && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleExpand(p.id);
                        }}
                        className="w-full flex items-center justify-between px-4 py-2 text-xs text-slate-400 hover:text-slate-200 transition-colors"
                      >
                        <span className="font-medium">Projektek ({subProjects.length})</span>
                        <svg
                          className={`w-3.5 h-3.5 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </button>
                    )}
                    {isExpanded && (
                      <div className="px-3 pb-3 space-y-1.5">
                        {subProjects.map((sp) => (
                          <SubProjectCard key={sp.id} sp={sp} projectId={p.id} onReload={load} />
                        ))}
                      </div>
                    )}
                    {addingSubTo === p.id && (
                      <NewSubProjectForm
                        projectId={p.id}
                        onCreated={() => {
                          setAddingSubTo(null);
                          load();
                        }}
                        onCancel={() => setAddingSubTo(null)}
                      />
                    )}
                  </div>
                )}

                {/* Add sub-project button */}
                <div className="border-t border-slate-700/30">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setAddingSubTo(addingSubTo === p.id ? null : p.id);
                    }}
                    className="w-full px-4 py-2 text-xs text-slate-500 hover:text-blue-400 hover:bg-slate-800/40 transition-colors text-left"
                  >
                    + Új projekt
                  </button>
                </div>

                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    navigate(`/project/${p.id}/settings`);
                  }}
                  className="absolute top-3.5 right-3 p-1.5 rounded-lg bg-slate-800/80 border border-slate-700/60 text-slate-500 hover:text-amber-400 hover:border-amber-600/40 opacity-0 group-hover:opacity-100 transition-all"
                  title="Beállítások"
                >
                  <svg
                    className="w-4 h-4"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
                    />
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                    />
                  </svg>
                </button>
              </div>
            );
          })}
        </div>

        {projects.length === 0 && !showNew && (
          <div className="text-center py-12 text-slate-500">
            Nincs projektcsoport. Hozz létre egyet a fenti gombbal.
          </div>
        )}
      </main>
    </div>
  );
}
