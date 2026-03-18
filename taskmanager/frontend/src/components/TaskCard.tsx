import { useState, useEffect, useRef, useCallback } from 'react';
import { api, getToken, type User } from '../api';
import type { Task, TaskStatus } from '../types';
import { STATUS_ORDER } from '../types';

const API_BASE =
  import.meta.env.VITE_API_URL?.replace(/\/$/, '') ||
  (window.location.port === '3001' ? 'http://localhost:3000' : '');

function fileRawUrl(workspace: string, filePath: string): string {
  const root = 'OpenClaw';
  const fullPath = filePath.startsWith('workspace')
    ? filePath
    : `${workspace}/${filePath}`;
  return `${API_BASE}/api/files/raw?root=${encodeURIComponent(root)}&path=${encodeURIComponent(fullPath)}&token=${encodeURIComponent(getToken() || '')}`;
}

const FILE_PATH_RE =
  /(?:^|\s)((?:\/[\w.+-]+)+\.(?:md|txt|json|html|csv|pdf|png|jpg|jpeg|gif|svg|webp|mp3|mp4|webm|wav|zip|yaml|yml|xml))(?:\s|$|[),.])/g;
const WORKSPACE_PATH_RE =
  /(?:^|\s)(\.?\/?(?:\.pi|\.openclaw|workspace[\w-]*)\/[\w/._+-]+\.(?:md|txt|json|html|csv|pdf|png|jpg|jpeg|gif|svg|webp|mp3|mp4|webm|wav|zip|yaml|yml|xml))(?:\s|$|[),.])/g;

function CommentContent({ content }: { content: string }) {
  const parts: (string | JSX.Element)[] = [];
  let lastIndex = 0;

  const matches: { start: number; end: number; path: string }[] = [];

  for (const re of [FILE_PATH_RE, WORKSPACE_PATH_RE]) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(content)) !== null) {
      const matchedPath = m[1];
      const start = m.index + m[0].indexOf(matchedPath);
      const end = start + matchedPath.length;
      if (!matches.some((x) => x.start === start))
        matches.push({ start, end, path: matchedPath });
    }
  }

  matches.sort((a, b) => a.start - b.start);

  for (const match of matches) {
    if (match.start > lastIndex) {
      parts.push(content.slice(lastIndex, match.start));
    }
    const ext = match.path.split('.').pop()?.toLowerCase() || '';
    const isImage = ['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp'].includes(ext);
    const isMedia = ['mp3', 'mp4', 'webm', 'wav'].includes(ext);
    const fileName = match.path.split('/').pop() || match.path;
    const icon = isImage ? '🖼️' : isMedia ? '🎬' : '📄';
    const url = fileRawUrl('', match.path);

    parts.push(
      <a
        key={match.start}
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 hover:text-blue-300 rounded text-xs font-mono transition-colors"
        title={match.path}
      >
        <span>{icon}</span>
        <span className="underline">{fileName}</span>
      </a>,
    );
    lastIndex = match.end;
  }

  if (lastIndex < content.length) {
    parts.push(content.slice(lastIndex));
  }

  if (parts.length === 1 && typeof parts[0] === 'string') {
    return <>{content}</>;
  }

  return <>{parts}</>;
}

interface TaskCardProps {
  task: Task;
  users: User[];
  onMove: (taskId: string, status: TaskStatus) => void;
  onUpdate?: () => void;
}

function AgentTerminal({ task }: { task: Task }) {
  const [liveStatus, setLiveStatus] = useState(task.liveStatus || null);
  const [updatedAt, setUpdatedAt] = useState(task.liveStatusUpdatedAt || null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (task.status !== 'Folyamatban') return;

    let cancelled = false;
    const poll = async () => {
      try {
        const fresh = await api.tasks.get(task.id);
        if (cancelled) return;
        setLiveStatus(fresh.liveStatus || null);
        setUpdatedAt(fresh.liveStatusUpdatedAt || null);
      } catch {
        // ignore
      }
    };

    const interval = setInterval(poll, 5000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [task.id, task.status]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [liveStatus]);

  const age = updatedAt
    ? Math.round((Date.now() - new Date(updatedAt).getTime()) / 1000)
    : null;

  const isStale = age !== null && age > 120;

  return (
    <div className="bg-gray-950 border border-slate-700 rounded-md overflow-hidden">
      <div className="flex items-center justify-between px-2 py-1 bg-slate-800/80 border-b border-slate-700">
        <div className="flex items-center gap-1.5">
          <span className={`w-2 h-2 rounded-full ${isStale ? 'bg-yellow-500' : 'bg-emerald-400 animate-pulse'}`} />
          <span className="text-[10px] font-medium text-slate-400 uppercase tracking-wide">
            {task.assignee?.name || 'Agent'} – Terminál
          </span>
        </div>
        {age !== null && (
          <span className="text-[10px] text-slate-600">
            {age < 60 ? `${age}s` : `${Math.round(age / 60)}m`} ezelőtt
          </span>
        )}
      </div>
      <div className="p-2 max-h-32 overflow-y-auto font-mono text-xs leading-relaxed">
        {liveStatus ? (
          <pre className={`whitespace-pre-wrap ${isStale ? 'text-yellow-400/80' : 'text-emerald-400'}`}>
            {liveStatus}
          </pre>
        ) : (
          <span className="text-slate-600 italic">Várakozás agent üzenetre...</span>
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}

function HumanNotes({ task, onSaved }: { task: Task; onSaved?: () => void }) {
  const [notes, setNotes] = useState(task.notes || '');
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    setNotes(task.notes || '');
    setDirty(false);
  }, [task.notes]);

  const save = useCallback(async (value: string) => {
    setSaving(true);
    try {
      await api.tasks.updateNotes(task.id, value);
      setDirty(false);
      onSaved?.();
    } catch {
      // ignore
    } finally {
      setSaving(false);
    }
  }, [task.id, onSaved]);

  const handleChange = (value: string) => {
    setNotes(value);
    setDirty(true);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => save(value), 1500);
  };

  const handleBlur = () => {
    if (dirty) {
      if (timerRef.current) clearTimeout(timerRef.current);
      save(notes);
    }
  };

  return (
    <div className="bg-slate-900 border border-slate-700 rounded-md overflow-hidden">
      <div className="flex items-center justify-between px-2 py-1 bg-slate-800/80 border-b border-slate-700">
        <span className="text-[10px] font-medium text-slate-400 uppercase tracking-wide">
          Jegyzetek – {task.assignee?.name || 'Felhasználó'}
        </span>
        <span className="text-[10px] text-slate-600">
          {saving ? 'Mentés...' : dirty ? 'Nincs mentve' : ''}
        </span>
      </div>
      <textarea
        value={notes}
        onChange={(e) => handleChange(e.target.value)}
        onBlur={handleBlur}
        placeholder="Írj jegyzeteket..."
        rows={3}
        className="w-full p-2 bg-transparent text-sm text-slate-200 placeholder-slate-600 resize-none focus:outline-none"
      />
    </div>
  );
}

export function TaskCard({ task, users, onMove, onUpdate }: TaskCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [comment, setComment] = useState('');
  const [fullTask, setFullTask] = useState<Task | null>(null);

  useEffect(() => {
    if (expanded) {
      api.tasks.get(task.id).then(setFullTask);
    } else {
      setFullTask(null);
    }
  }, [expanded, task.id]);

  const handleAddComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!comment.trim()) return;
    try {
      await api.tasks.addComment(task.id, comment.trim());
      setComment('');
      const updated = await api.tasks.get(task.id);
      setFullTask(updated);
    } catch {
      // ignore
    }
  };

  const priorityColor: Record<string, string> = {
    low: 'border-l-slate-500',
    medium: 'border-l-amber-500',
    high: 'border-l-orange-500',
    critical: 'border-l-red-500',
  };

  const isInProgress = task.status === 'Folyamatban';
  const isAgent = task.assignee?.role === 'agent';

  return (
    <div
      className={`bg-slate-800/80 border border-slate-700 rounded-lg border-l-4 ${priorityColor[task.priority] || 'border-l-slate-500'} overflow-hidden`}
    >
      <div
        className="p-3 cursor-pointer"
        onClick={() => setExpanded(!expanded)}
      >
        <p className="text-slate-100 text-sm font-medium line-clamp-2">
          <span className="text-amber-500/80 font-mono text-xs mr-1.5">T-{task.shortId}</span>
          {task.title}
        </p>
        {task.subProject && (
          <div className="mt-1 inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-slate-700/50 border border-slate-600/30">
            <span
              className="w-1.5 h-1.5 rounded-full"
              style={{ backgroundColor: task.subProject.color || '#3b82f6' }}
            />
            <span className="text-[10px] text-slate-400">{task.subProject.name}</span>
          </div>
        )}
        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-slate-500">
          {task.assignee && (
            <span title={task.assignee.email}>
              {isAgent ? '🤖' : '👤'} {task.assignee.name || task.assignee.email}
            </span>
          )}
          {task.dueAt && (
            <span>
              📅 {new Date(task.dueAt).toLocaleDateString('hu-HU')}
            </span>
          )}
        </div>
      </div>

      {isInProgress && task.assignee && (
        <div className="px-3 pb-3" onClick={(e) => e.stopPropagation()}>
          {isAgent ? (
            <AgentTerminal task={task} />
          ) : (
            <HumanNotes task={task} onSaved={onUpdate} />
          )}
        </div>
      )}

      {expanded && (
        <div className="border-t border-slate-700 p-3 space-y-3">
          {task.description && (
            <p className="text-sm text-slate-400 whitespace-pre-wrap">
              {task.description}
            </p>
          )}

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {task.subProject !== undefined && (
              <div className="sm:col-span-2">
                <p className="text-xs text-slate-500 mb-1">Projekt</p>
                <div className="flex items-center gap-1.5 text-sm text-slate-300">
                  {task.subProject ? (
                    <>
                      <span
                        className="w-2 h-2 rounded-full"
                        style={{ backgroundColor: task.subProject.color || '#3b82f6' }}
                      />
                      {task.subProject.name}
                    </>
                  ) : (
                    <span className="text-slate-500 italic">Nincs hozzárendelve</span>
                  )}
                </div>
              </div>
            )}
            <div>
              <p className="text-xs text-slate-500 mb-1">Felelős</p>
              <select
                value={task.assigneeId ?? ''}
                onChange={async (e) => {
                  const v = e.target.value;
                  try {
                    await api.tasks.update(task.id, {
                      assigneeId: v ? v : null,
                    });
                    onUpdate?.();
                  } catch {}
                }}
                className="w-full text-sm bg-slate-700 border border-slate-600 rounded px-2 py-1 text-slate-200"
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
              <p className="text-xs text-slate-500 mb-1">Határidő</p>
              <input
                type="date"
                value={task.dueAt ? new Date(task.dueAt).toISOString().slice(0, 10) : ''}
                onChange={async (e) => {
                  const v = e.target.value || null;
                  try {
                    await api.tasks.update(task.id, { dueAt: v });
                    onUpdate?.();
                  } catch {}
                }}
                className="w-full text-sm bg-slate-700 border border-slate-600 rounded px-2 py-1 text-slate-200"
              />
            </div>
          </div>
          <div>
            <p className="text-xs text-slate-500 mb-1">Áthelyezés</p>
            <select
              value={task.status}
              onChange={(e) => onMove(task.id, e.target.value as TaskStatus)}
              className="w-full text-sm bg-slate-700 border border-slate-600 rounded px-2 py-1 text-slate-200"
            >
              {STATUS_ORDER.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>

          {(fullTask?.comments ?? task.comments) && (fullTask?.comments ?? task.comments)!.length > 0 && (
            <div>
              <p className="text-xs text-slate-500 mb-1">Megjegyzések:</p>
              <ul className="space-y-1 text-sm text-slate-400">
                {(fullTask?.comments ?? task.comments)!.map((c) => (
                  <li key={c.id} className="bg-slate-900/50 rounded px-2 py-1">
                    <CommentContent content={c.content} />
                    <span className="text-slate-600 text-xs ml-1">
                      – {c.user?.name || 'Agent'}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <form onSubmit={handleAddComment}>
            <input
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Új megjegyzés..."
              className="w-full text-sm bg-slate-700 border border-slate-600 rounded px-2 py-1 text-slate-200 placeholder-slate-500"
            />
          </form>
        </div>
      )}
    </div>
  );
}
