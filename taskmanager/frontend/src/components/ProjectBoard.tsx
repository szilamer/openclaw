import { useState, useEffect } from 'react';
import { useParams, Link, useSearchParams } from 'react-router-dom';
import { api, type User } from '../api';
import type { Project, Task, TaskStatus, SubProject } from '../types';
import { STATUS_ORDER } from '../types';
import { TaskCard } from './TaskCard';

export function ProjectBoard() {
  const { projectId } = useParams<{ projectId: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const [project, setProject] = useState<Project | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [subProjects, setSubProjects] = useState<SubProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showNewTask, setShowNewTask] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newAssigneeId, setNewAssigneeId] = useState<string>('');
  const [newDueAt, setNewDueAt] = useState<string>('');
  const [newSubProjectId, setNewSubProjectId] = useState<string>('');
  const activeSubProjectId = searchParams.get('subProject') || '';

  const load = async () => {
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
  };

  useEffect(() => {
    load();
  }, [projectId]);

  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!projectId || !newTitle.trim()) return;
    try {
      await api.tasks.create({
        projectId,
        title: newTitle.trim(),
        description: newDesc.trim() || undefined,
        assigneeId: newAssigneeId || undefined,
        dueAt: newDueAt || undefined,
        subProjectId: newSubProjectId || undefined,
      });
      setNewTitle('');
      setNewDesc('');
      setNewAssigneeId('');
      setNewDueAt('');
      setNewSubProjectId('');
      setShowNewTask(false);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Hiba');
    }
  };

  const handleMove = async (taskId: string, status: TaskStatus) => {
    const reasonPrompt = window.prompt("Státuszváltáshoz add meg az azonosítót és indokot:\n(formátum: admin123! : indok)");
    if (!reasonPrompt) return;
    
    if (!reasonPrompt.trim().startsWith("admin123! :")) {
      setError("Hibás azonosító, formátum: admin123! : szöveg");
      return;
    }
    
    const statusReason = reasonPrompt.split("admin123! :")[1]?.trim() || "";
    if (statusReason.length < 3) {
      setError("Az indoklásnak legalább 3 karakternek kell lennie.");
      return;
    }

    try {
      await api.tasks.move(taskId, status);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Hiba');
    }
  };

  const filteredTasks = activeSubProjectId === '__none__'
    ? tasks.filter((t) => !t.subProjectId)
    : activeSubProjectId
      ? tasks.filter((t) => t.subProjectId === activeSubProjectId)
      : tasks;

  const tasksByStatus = STATUS_ORDER.reduce(
    (acc, s) => {
      acc[s] = filteredTasks.filter((t) => t.status === s);
      return acc;
    },
    {} as Record<TaskStatus, Task[]>
  );

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

  return (
    <div className="min-h-screen">
      <header className="border-b border-slate-800 bg-slate-900/50 sticky top-0 z-10">
        <div className="max-w-[1600px] mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link
              to="/"
              className="text-slate-400 hover:text-slate-200 transition-colors"
            >
              ← Projektcsoportok
            </Link>
            <h1 className="text-xl font-semibold text-slate-100">{project.name}</h1>
            <span className="text-[10px] px-1.5 py-0.5 bg-slate-800/80 text-slate-500 border border-slate-700/50 rounded font-medium">
              csoport
            </span>
            <div className="flex items-center bg-slate-800 rounded-lg overflow-hidden ml-2">
              <span className="px-3 py-1.5 text-xs font-medium bg-amber-600 text-white">
                Kanban
              </span>
              <Link
                to={`/project/${projectId}/gantt`}
                className="px-3 py-1.5 text-xs font-medium text-slate-400 hover:text-slate-200 transition-colors"
              >
                Gantt
              </Link>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link
              to={`/project/${projectId}/settings`}
              className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-200 text-sm font-medium rounded-lg transition-colors"
            >
              Beállítások
            </Link>
            <button
              onClick={() => setShowNewTask(!showNewTask)}
              className="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white text-sm font-medium rounded-lg transition-colors"
            >
              + Új feladat
            </button>
          </div>
        </div>
      </header>

      {subProjects.length > 0 && (
        <div className="border-b border-slate-800 bg-slate-900/30">
          <div className="max-w-[1600px] mx-auto px-4 py-2 flex items-center gap-2 overflow-x-auto">
            <span className="text-xs text-slate-500 flex-shrink-0 mr-1">Projekt:</span>
            <button
              onClick={() => setSearchParams({})}
              className={`px-3 py-1 text-xs rounded-full transition-colors flex-shrink-0 ${
                !activeSubProjectId
                  ? 'bg-amber-600 text-white'
                  : 'bg-slate-800 text-slate-400 hover:text-slate-200 border border-slate-700'
              }`}
            >
              Mind ({tasks.length})
            </button>
            {subProjects.map((sp) => {
              const count = tasks.filter((t) => t.subProjectId === sp.id).length;
              const planLabel =
                sp.planningStatus === 'triggered' ? ' ⏳'
                : sp.planningStatus === 'in_progress' ? ' ⚙️'
                : sp.planningStatus === 'failed' ? ' ❌'
                : sp.planningStatus === 'pending' ? ' 🔔'
                : '';
              return (
                <button
                  key={sp.id}
                  onClick={() => setSearchParams({ subProject: sp.id })}
                  className={`inline-flex items-center gap-1.5 px-3 py-1 text-xs rounded-full transition-colors flex-shrink-0 ${
                    activeSubProjectId === sp.id
                      ? 'text-white'
                      : 'bg-slate-800 text-slate-400 hover:text-slate-200 border border-slate-700'
                  }`}
                  style={activeSubProjectId === sp.id ? { backgroundColor: sp.color || '#3b82f6' } : undefined}
                >
                  <span
                    className="w-2 h-2 rounded-full flex-shrink-0"
                    style={{ backgroundColor: sp.color || '#3b82f6' }}
                  />
                  {sp.name} ({count}){planLabel}
                </button>
              );
            })}
            <button
              onClick={() => {
                if (activeSubProjectId === '__none__') setSearchParams({});
                else setSearchParams({ subProject: '__none__' });
              }}
              className={`px-3 py-1 text-xs rounded-full transition-colors flex-shrink-0 ${
                activeSubProjectId === '__none__'
                  ? 'bg-slate-600 text-white'
                  : 'bg-slate-800 text-slate-400 hover:text-slate-200 border border-slate-700'
              }`}
            >
              Projekt nélkül ({tasks.filter((t) => !t.subProjectId).length})
            </button>
          </div>
        </div>
      )}

      {/* Active sub-project planning panel */}
      {(() => {
        const activeSp = activeSubProjectId && activeSubProjectId !== '__none__'
          ? subProjects.find((sp) => sp.id === activeSubProjectId)
          : null;
        if (!activeSp || !activeSp.requirements?.trim()) return null;
        const canTrigger = activeSp.planningStatus === 'none' || activeSp.planningStatus === 'pending' || activeSp.planningStatus === 'failed';
        const isProcessing = activeSp.planningStatus === 'triggered' || activeSp.planningStatus === 'in_progress';
        return (
          <div className="border-b border-slate-800 bg-slate-900/20">
            <div className="max-w-[1600px] mx-auto px-4 py-2 flex items-center gap-3">
              <svg className="w-4 h-4 text-slate-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <p className="text-xs text-slate-400 flex-1 line-clamp-1" title={activeSp.requirements}>
                <span className="text-slate-500 font-medium">Követelmények:</span> {activeSp.requirements}
              </p>
              {canTrigger && (
                <button
                  onClick={async () => {
                    try {
                      await api.projects.triggerPlanning(activeSp.id);
                      load();
                    } catch (err) {
                      setError(err instanceof Error ? err.message : 'Hiba');
                    }
                  }}
                  className="flex-shrink-0 inline-flex items-center gap-1.5 px-3 py-1 bg-amber-600 hover:bg-amber-500 text-white text-xs font-medium rounded-lg transition-colors"
                >
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                  </svg>
                  {activeSp.planningStatus === 'failed' ? 'Újra tervezés' : 'Tervezés indítása'}
                </button>
              )}
              {isProcessing && (
                <span className="flex-shrink-0 inline-flex items-center gap-1.5 px-3 py-1 bg-blue-900/30 text-blue-400 text-xs font-medium rounded-lg border border-blue-700/30">
                  <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Tervezés folyamatban...
                </span>
              )}
              {activeSp.planningStatus === 'completed' && (
                <span className="flex-shrink-0 inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-900/30 text-emerald-400 text-xs font-medium rounded-lg border border-emerald-700/30">
                  ✓ Megtervezve
                </span>
              )}
            </div>
          </div>
        );
      })()}

      <main className="max-w-[1600px] mx-auto px-4 py-6 overflow-x-auto">
        {error && (
          <div className="mb-4 p-4 bg-red-900/30 border border-red-800 rounded-lg text-red-300 text-sm">
            {error}
          </div>
        )}

        {showNewTask && (
          <form
            onSubmit={handleCreateTask}
            className="mb-6 p-4 bg-slate-900/60 border border-slate-700 rounded-xl max-w-md"
          >
            <input
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="Feladat címe"
              className="w-full px-4 py-2 bg-slate-800 border border-slate-600 rounded-lg text-slate-100 mb-2 focus:outline-none focus:ring-2 focus:ring-amber-500/50"
              autoFocus
            />
            <textarea
              value={newDesc}
              onChange={(e) => setNewDesc(e.target.value)}
              placeholder="Leírás (opcionális)"
              rows={2}
              className="w-full px-4 py-2 bg-slate-800 border border-slate-600 rounded-lg text-slate-100 mb-2 focus:outline-none focus:ring-2 focus:ring-amber-500/50 resize-none"
            />
            <div className="grid grid-cols-3 gap-2 mb-3">
              <div>
                <label className="block text-xs text-slate-500 mb-1">Projekt</label>
                <select
                  value={newSubProjectId}
                  onChange={(e) => setNewSubProjectId(e.target.value)}
                  className="w-full px-4 py-2 bg-slate-800 border border-slate-600 rounded-lg text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/50"
                >
                  <option value="">— Nincs —</option>
                  {subProjects.map((sp) => (
                    <option key={sp.id} value={sp.id}>
                      {sp.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">Felelős</label>
                <select
                  value={newAssigneeId}
                  onChange={(e) => setNewAssigneeId(e.target.value)}
                  className="w-full px-4 py-2 bg-slate-800 border border-slate-600 rounded-lg text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/50"
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
                <label className="block text-xs text-slate-500 mb-1">Határidő</label>
                <input
                  type="date"
                  value={newDueAt}
                  onChange={(e) => setNewDueAt(e.target.value)}
                  className="w-full px-4 py-2 bg-slate-800 border border-slate-600 rounded-lg text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/50"
                />
              </div>
            </div>
            <div className="flex gap-2">
              <button
                type="submit"
                className="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white text-sm font-medium rounded-lg"
              >
                Létrehozás
              </button>
              <button
                type="button"
                onClick={() => setShowNewTask(false)}
                className="px-4 py-2 text-slate-400 hover:text-slate-200 text-sm"
              >
                Mégse
              </button>
            </div>
          </form>
        )}

        <div className="flex gap-4 min-w-max pb-4">
          {STATUS_ORDER.map((status) => (
            <div
              key={status}
              className="w-64 flex-shrink-0 bg-slate-900/40 border border-slate-700 rounded-xl p-3"
            >
              <h3 className="font-medium text-slate-300 mb-3 text-sm">
                {status}
                <span className="ml-2 text-slate-500">
                  ({tasksByStatus[status].length})
                </span>
              </h3>
              <div className="space-y-2">
                {tasksByStatus[status].map((task) => (
                  <TaskCard
                    key={task.id}
                    task={task}
                    users={users}
                    onMove={handleMove}
                    onUpdate={load}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
