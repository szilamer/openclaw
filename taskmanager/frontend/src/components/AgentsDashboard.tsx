import { useState, useEffect, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AgentIdentity {
  name: string;
  theme: string;
  emoji: string;
}

interface AgentCurrentTask {
  id: string;
  shortId: number;
  title: string;
  liveStatus: string | null;
  liveStatusUpdatedAt: string | null;
}

interface AgentActiveTask {
  id: string;
  shortId: number;
  title: string;
  status: string;
  liveStatus: string | null;
}

interface AgentStats {
  completedTasks: number;
  totalTasks: number;
  activeTasks: number;
  totalRuns: number;
  successfulRuns: number;
  successRate: number;
  totalTokens: number;
  totalCost: number;
  costPerTask: number;
  avgTokensPerRun: number;
  avgDurationMs: number;
  totalDurationMs: number;
}

interface AgentCronJob {
  id: string;
  name: string;
  enabled: boolean;
  schedule: unknown;
  lastStatus: string;
  lastRunAt: number;
  lastDurationMs: number;
}

interface AgentData {
  id: string;
  name: string;
  identity: AgentIdentity;
  model: string;
  fallbacks: string[];
  sandbox: string;
  subagents: string[];
  dbUserId: string | null;
  currentTask: AgentCurrentTask | null;
  activeTasks: AgentActiveTask[];
  stats: AgentStats;
  cronJobs: AgentCronJob[];
}

interface BudgetConfig {
  dailyMaxUsd: number | null;
  warningThresholdPct: number;
  strategy: 'skip' | 'fallback' | 'warn';
  fallbackModel: string | null;
}

interface AgentsResponse {
  agents: AgentData[];
  defaults: {
    model: string;
    fallbacks: string[];
    heartbeat: string;
    maxConcurrent: number;
    budget: BudgetConfig;
  };
}

interface AvailableModel {
  id: string;
  provider: string;
  name: string;
  tier: 'subscription' | 'api';
  hasApiKey: boolean;
}

type ActivityEntry =
  | { type: 'comment'; ts: number; taskId: string; taskShortId: number; taskTitle: string; content: string }
  | { type: 'cron_run'; ts: number; jobName: string; status: string; summary: string; durationMs: number; tokens: number };

type ActivityWithAgent = ActivityEntry & { agentId: string; agentEmoji: string; agentName: string };

// ---------------------------------------------------------------------------
// Constants & helpers
// ---------------------------------------------------------------------------

const THEME_COLORS: Record<string, string> = {
  orchestrator: '#f59e0b',
  developer: '#3b82f6',
  marketing: '#8b5cf6',
  security: '#ef4444',
  general: '#6b7280',
};

const THEME_CLASSES: Record<string, { border: string; bg: string; text: string; badge: string }> = {
  orchestrator: { border: 'border-amber-600/40', bg: 'bg-amber-900/10', text: 'text-amber-400', badge: 'bg-amber-900/50 text-amber-300' },
  developer: { border: 'border-blue-600/40', bg: 'bg-blue-900/10', text: 'text-blue-400', badge: 'bg-blue-900/50 text-blue-300' },
  marketing: { border: 'border-purple-600/40', bg: 'bg-purple-900/10', text: 'text-purple-400', badge: 'bg-purple-900/50 text-purple-300' },
  security: { border: 'border-red-600/40', bg: 'bg-red-900/10', text: 'text-red-400', badge: 'bg-red-900/50 text-red-300' },
  general: { border: 'border-slate-600/40', bg: 'bg-slate-800/10', text: 'text-slate-400', badge: 'bg-slate-700/50 text-slate-300' },
};

function themeOf(agent: AgentData) {
  return THEME_CLASSES[agent.identity?.theme] ?? THEME_CLASSES.general;
}

function formatTokens(n: number | null | undefined): string {
  const v = n ?? 0;
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(1)}K`;
  return v.toLocaleString('hu-HU');
}

function formatCost(n: number | null | undefined): string {
  return `$${(n ?? 0).toFixed(2)}`;
}

function relativeTime(ts: number): string {
  const diff = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (diff < 60) return `${diff} mp`;
  if (diff < 3600) return `${Math.floor(diff / 60)} perc`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} óra`;
  return `${Math.floor(diff / 86400)} nap`;
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max) + '…' : s;
}

const STATUS_BADGE_CLASSES: Record<string, string> = {
  Folyamatban: 'bg-emerald-900/50 text-emerald-300',
  Teendő: 'bg-blue-900/50 text-blue-300',
  Várakozás: 'bg-yellow-900/50 text-yellow-300',
  Felülvizsgálat: 'bg-purple-900/50 text-purple-300',
  Kész: 'bg-slate-700/50 text-slate-400',
  Beérkező: 'bg-slate-700/50 text-slate-400',
};

const CRON_STATUS_DOT: Record<string, string> = {
  success: 'bg-emerald-400',
  failure: 'bg-red-400',
  running: 'bg-amber-400 animate-pulse',
};

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function AgentNetworkVisualization({ agents }: { agents: AgentData[] }) {
  if (agents.length === 0) return null;

  const orchestrator = agents[0];
  const subagents = agents.slice(1);
  const containerW = 800;
  const containerH = 300;
  const cx = containerW / 2;
  const cy = containerH / 2;
  const radius = 120;

  return (
    <div className="relative bg-slate-950 rounded-2xl border border-slate-800 overflow-hidden mb-8"
      style={{ height: containerH }}
    >
      {/* Grid pattern */}
      <div className="absolute inset-0 opacity-10"
        style={{
          backgroundImage: 'linear-gradient(rgba(148,163,184,.3) 1px, transparent 1px), linear-gradient(90deg, rgba(148,163,184,.3) 1px, transparent 1px)',
          backgroundSize: '40px 40px',
        }}
      />

      <svg className="absolute inset-0 w-full h-full" viewBox={`0 0 ${containerW} ${containerH}`} preserveAspectRatio="xMidYMid meet">
        <defs>
          <filter id="glow">
            <feGaussianBlur stdDeviation="4" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {subagents.map((agent, i) => {
          const angle = (2 * Math.PI * i) / Math.max(subagents.length, 1) - Math.PI / 2;
          const x = cx + radius * Math.cos(angle);
          const y = cy + radius * Math.sin(angle);
          const isActive = agent.currentTask !== null;
          const color = THEME_COLORS[agent.identity?.theme] ?? THEME_COLORS.general;

          return (
            <line
              key={`line-${agent.id}`}
              x1={cx} y1={cy} x2={x} y2={y}
              stroke={color}
              strokeWidth={isActive ? 2 : 1}
              strokeDasharray="6 4"
              opacity={isActive ? 0.8 : 0.3}
            >
              {isActive && (
                <animate attributeName="stroke-dashoffset" from="0" to="-20" dur="1s" repeatCount="indefinite" />
              )}
            </line>
          );
        })}
      </svg>

      {/* Orchestrator node (center) */}
      <div className="absolute flex flex-col items-center" style={{ left: cx - 36, top: cy - 36 }}>
        <div
          className={`w-[72px] h-[72px] rounded-full flex items-center justify-center text-2xl font-bold border-2 shadow-lg transition-all duration-300 ${orchestrator.currentTask ? 'animate-pulse' : ''}`}
          style={{
            borderColor: THEME_COLORS[orchestrator.identity?.theme] ?? THEME_COLORS.general,
            backgroundColor: `${THEME_COLORS[orchestrator.identity?.theme] ?? THEME_COLORS.general}20`,
            boxShadow: `0 0 20px ${THEME_COLORS[orchestrator.identity?.theme] ?? THEME_COLORS.general}40`,
          }}
        >
          {orchestrator.identity?.emoji || '🤖'}
        </div>
        <span className="mt-1 text-xs font-medium text-slate-200 whitespace-nowrap">
          {orchestrator.identity?.name || orchestrator.name}
        </span>
        <span className="text-[10px] text-slate-500 max-w-[100px] text-center truncate">
          {orchestrator.currentTask
            ? truncate(orchestrator.currentTask.liveStatus || orchestrator.currentTask.title, 25)
            : 'Inaktív'}
        </span>
      </div>

      {/* Subagent nodes */}
      {subagents.map((agent, i) => {
        const angle = (2 * Math.PI * i) / Math.max(subagents.length, 1) - Math.PI / 2;
        const x = cx + radius * Math.cos(angle);
        const y = cy + radius * Math.sin(angle);
        const isActive = agent.currentTask !== null;
        const color = THEME_COLORS[agent.identity?.theme] ?? THEME_COLORS.general;

        return (
          <div key={agent.id} className="absolute flex flex-col items-center" style={{ left: x - 26, top: y - 26 }}>
            <div
              className={`w-[52px] h-[52px] rounded-full flex items-center justify-center text-lg border-2 transition-all duration-300 ${isActive ? 'animate-pulse' : ''}`}
              style={{
                borderColor: color,
                backgroundColor: `${color}15`,
                boxShadow: isActive ? `0 0 16px ${color}50` : `0 0 8px ${color}20`,
              }}
            >
              {agent.identity?.emoji || '🤖'}
            </div>
            <span className="mt-0.5 text-[11px] font-medium text-slate-300 whitespace-nowrap">
              {agent.identity?.name || agent.name}
            </span>
            <span className="text-[10px] text-slate-500 max-w-[90px] text-center truncate">
              {isActive
                ? truncate(agent.currentTask!.liveStatus || agent.currentTask!.title, 25)
                : 'Inaktív'}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function AgentDetailCard({
  agent,
  onConfigureModel,
}: {
  agent: AgentData;
  onConfigureModel: (agent: AgentData) => void;
}) {
  const theme = themeOf(agent);
  const isActive = agent.currentTask !== null;
  const enabledCrons = agent.cronJobs.filter((c) => c.enabled);

  return (
    <div className={`border rounded-xl p-5 ${theme.border} ${theme.bg} transition-all duration-300`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <span className="text-2xl">{agent.identity?.emoji || '🤖'}</span>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-lg font-semibold text-slate-100">{agent.identity?.name || agent.name}</h3>
              <span className={`text-[10px] px-2 py-0.5 rounded-full uppercase tracking-wider ${theme.badge}`}>
                {agent.identity?.theme || 'general'}
              </span>
            </div>
            <button
              type="button"
              onClick={() => onConfigureModel(agent)}
              className="text-xs text-slate-500 font-mono hover:text-amber-400 transition-colors flex items-center gap-1 group"
              title="Modell konfiguráció"
            >
              <span>{agent.model?.split('/').pop()}</span>
              {agent.fallbacks?.length > 0 && (
                <span className="text-[10px] text-slate-600 group-hover:text-amber-400/60">
                  +{agent.fallbacks.length} tartalék
                </span>
              )}
              <svg className="w-3 h-3 text-slate-600 group-hover:text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </button>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <span className={`w-2.5 h-2.5 rounded-full ${isActive ? 'bg-emerald-400 animate-pulse' : 'bg-slate-600'}`} />
          <span className={`text-xs font-medium ${isActive ? 'text-emerald-400' : 'text-slate-500'}`}>
            {isActive ? 'Aktív' : 'Inaktív'}
          </span>
        </div>
      </div>

      {/* Current task */}
      {agent.currentTask && (
        <div className="mb-4 p-3 bg-slate-800/40 rounded-lg border border-slate-700/50">
          <div className="flex items-center gap-2 mb-1">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-xs text-slate-400">Aktuális feladat</span>
          </div>
          <p className="text-sm font-medium text-slate-200">
            T-{agent.currentTask.shortId}: {agent.currentTask.title}
          </p>
          {agent.currentTask.liveStatus && (
            <p className="text-xs text-slate-400 mt-1 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
              {truncate(agent.currentTask.liveStatus, 80)}
            </p>
          )}
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-4 gap-2 mb-4">
        <MiniStat label="Elvégzett" value={(agent.stats?.completedTasks ?? 0).toLocaleString('hu-HU')} color={theme.text} />
        <MiniStat label="Siker%" value={`${Math.round(agent.stats?.successRate ?? 0)}%`} color={(agent.stats?.successRate ?? 0) >= 80 ? 'text-emerald-400' : 'text-amber-400'} />
        <MiniStat label="Költség/task" value={formatCost(agent.stats?.costPerTask ?? 0)} color="text-blue-400" />
        <MiniStat label="Token össz." value={formatTokens(agent.stats?.totalTokens ?? 0)} color="text-purple-400" />
      </div>

      {/* Active tasks */}
      {agent.activeTasks.length > 0 && (
        <div className="mb-3">
          <p className="text-xs text-slate-500 uppercase tracking-wide mb-1.5">Aktív feladatok</p>
          <div className="space-y-1">
            {agent.activeTasks.slice(0, 5).map((t) => (
              <div key={t.id} className="flex items-center justify-between text-xs px-2 py-1 bg-slate-800/30 rounded">
                <span className="text-slate-300 truncate mr-2">T-{t.shortId}: {truncate(t.title, 40)}</span>
                <span className={`px-1.5 py-0.5 rounded text-[10px] whitespace-nowrap ${STATUS_BADGE_CLASSES[t.status] ?? 'bg-slate-700 text-slate-400'}`}>
                  {t.status}
                </span>
              </div>
            ))}
            {agent.activeTasks.length > 5 && (
              <p className="text-[10px] text-slate-600 pl-2">+{agent.activeTasks.length - 5} további</p>
            )}
          </div>
        </div>
      )}

      {/* Cron jobs */}
      {enabledCrons.length > 0 && (
        <div>
          <p className="text-xs text-slate-500 uppercase tracking-wide mb-1.5">Cron feladatok</p>
          <div className="space-y-1">
            {enabledCrons.map((c) => (
              <div key={c.id} className="flex items-center justify-between text-xs px-2 py-1 bg-slate-800/30 rounded">
                <div className="flex items-center gap-1.5">
                  <span className={`w-2 h-2 rounded-full ${CRON_STATUS_DOT[c.lastStatus] ?? 'bg-slate-500'}`} />
                  <span className="text-slate-300">{c.name}</span>
                </div>
                <span className="text-slate-500 font-mono text-[10px]">
                  {typeof c.schedule === 'string' ? c.schedule : JSON.stringify(c.schedule)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function MiniStat({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="text-center">
      <p className="text-[10px] text-slate-500 uppercase tracking-wide">{label}</p>
      <p className={`text-sm font-bold mt-0.5 ${color}`}>{value}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Model Config Modal (per-agent drag-and-drop)
// ---------------------------------------------------------------------------

function ModelConfigModal({
  agent,
  availableModels,
  onClose,
  onSaved,
}: {
  agent: AgentData;
  availableModels: AvailableModel[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [primary, setPrimary] = useState(agent.model || '');
  const [fallbacks, setFallbacks] = useState<string[]>(agent.fallbacks || []);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [dragOverTarget, setDragOverTarget] = useState<string | null>(null);
  const [dragOverFbIdx, setDragOverFbIdx] = useState<number | null>(null);

  const usedModels = new Set([primary, ...fallbacks].filter(Boolean));
  const unusedModels = availableModels.filter((m) => !usedModels.has(m.id));

  const handleSave = async () => {
    if (!primary) return;
    setSaving(true);
    setError('');
    try {
      await api.agents.update(agent.id, {
        model: primary,
        fallbacks: fallbacks.filter(Boolean),
      });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Hiba történt');
    } finally {
      setSaving(false);
    }
  };

  const handleDragStart = (e: React.DragEvent, modelId: string) => {
    e.dataTransfer.setData('text/plain', modelId);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDropPrimary = (e: React.DragEvent) => {
    e.preventDefault();
    const modelId = e.dataTransfer.getData('text/plain');
    if (!modelId) return;
    const oldPrimary = primary;
    setPrimary(modelId);
    setFallbacks((prev) => {
      const cleaned = prev.filter((f) => f !== modelId);
      if (oldPrimary && oldPrimary !== modelId) {
        return [oldPrimary, ...cleaned];
      }
      return cleaned;
    });
    setDragOverTarget(null);
  };

  const handleDropFallback = (e: React.DragEvent, targetIdx?: number) => {
    e.preventDefault();
    const modelId = e.dataTransfer.getData('text/plain');
    if (!modelId || modelId === primary) return;
    setFallbacks((prev) => {
      const cleaned = prev.filter((f) => f !== modelId);
      if (targetIdx !== undefined && targetIdx >= 0) {
        cleaned.splice(targetIdx, 0, modelId);
      } else {
        cleaned.push(modelId);
      }
      return cleaned;
    });
    setDragOverTarget(null);
    setDragOverFbIdx(null);
  };

  const removeFallback = (modelId: string) => {
    setFallbacks((prev) => prev.filter((f) => f !== modelId));
  };

  const providerBadge = (id: string) => {
    const provider = id.split('/')[0];
    const colors: Record<string, string> = {
      openai: 'bg-emerald-900/50 text-emerald-300',
      'openai-codex': 'bg-emerald-900/50 text-emerald-300',
      anthropic: 'bg-orange-900/50 text-orange-300',
      openrouter: 'bg-violet-900/50 text-violet-300',
    };
    return colors[provider] || 'bg-slate-700/50 text-slate-300';
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-slate-900 border border-slate-700 rounded-2xl p-6 w-full max-w-2xl shadow-2xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 mb-1">
          <span className="text-2xl">{agent.identity?.emoji || '🤖'}</span>
          <h2 className="text-lg font-semibold text-slate-100">
            {agent.identity?.name || agent.name} — Modell beállítások
          </h2>
        </div>
        <p className="text-xs text-slate-500 mb-5">
          Húzd az elérhető modellek közül az elsődleges vagy tartalék helyekre.
          A tartalékok sorrendben lépnek életbe, ha az előző modell hibázik (pl. rate limit, számlázási hiba).
        </p>

        {error && (
          <div className="mb-4 p-3 bg-red-900/30 border border-red-800 rounded-lg text-red-300 text-sm">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {/* Left: Current configuration */}
          <div>
            <h4 className="text-xs text-slate-400 uppercase tracking-wide mb-2">Jelenlegi konfiguráció</h4>

            {/* Primary model drop zone */}
            <div
              className={`border-2 border-dashed rounded-xl p-4 mb-3 transition-all ${
                dragOverTarget === 'primary'
                  ? 'border-amber-500 bg-amber-900/20'
                  : 'border-slate-600 bg-slate-800/30'
              }`}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOverTarget('primary');
              }}
              onDragLeave={() => setDragOverTarget(null)}
              onDrop={handleDropPrimary}
            >
              <p className="text-[10px] text-slate-500 uppercase tracking-wide mb-2">Elsődleges modell</p>
              {primary ? (
                <div className="flex items-center gap-2">
                  <span className={`text-[10px] px-1.5 py-0.5 rounded ${providerBadge(primary)}`}>
                    {primary.split('/')[0]}
                  </span>
                  <span className="text-sm font-medium text-slate-200 font-mono">
                    {primary.split('/').slice(1).join('/')}
                  </span>
                </div>
              ) : (
                <p className="text-sm text-slate-600 italic">Húzz ide egy modellt</p>
              )}
            </div>

            {/* Fallbacks drop zone */}
            <div
              className={`border-2 border-dashed rounded-xl p-4 transition-all min-h-[120px] ${
                dragOverTarget === 'fallbacks'
                  ? 'border-blue-500 bg-blue-900/10'
                  : 'border-slate-600 bg-slate-800/30'
              }`}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOverTarget('fallbacks');
                setDragOverFbIdx(null);
              }}
              onDragLeave={() => {
                setDragOverTarget(null);
                setDragOverFbIdx(null);
              }}
              onDrop={(e) => handleDropFallback(e)}
            >
              <p className="text-[10px] text-slate-500 uppercase tracking-wide mb-2">
                Tartalék modellek (sorrend számít)
              </p>
              {fallbacks.length === 0 ? (
                <p className="text-sm text-slate-600 italic">
                  Húzz ide modelleket — sorrendben fognak aktiválódni hiba esetén
                </p>
              ) : (
                <div className="space-y-1.5">
                  {fallbacks.map((fb, idx) => (
                    <div
                      key={fb}
                      draggable
                      onDragStart={(e) => handleDragStart(e, fb)}
                      onDragOver={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setDragOverFbIdx(idx);
                      }}
                      onDrop={(e) => {
                        e.stopPropagation();
                        handleDropFallback(e, idx);
                      }}
                      className={`flex items-center justify-between px-3 py-2 rounded-lg cursor-grab active:cursor-grabbing transition-all ${
                        dragOverFbIdx === idx
                          ? 'bg-blue-900/30 border border-blue-500/50'
                          : 'bg-slate-800/60 border border-slate-700/50 hover:border-slate-600'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-slate-600 text-xs font-mono w-4">#{idx + 1}</span>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded ${providerBadge(fb)}`}>
                          {fb.split('/')[0]}
                        </span>
                        <span className="text-sm text-slate-300 font-mono">
                          {fb.split('/').slice(1).join('/')}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => removeFallback(fb)}
                        className="text-slate-600 hover:text-red-400 transition-colors text-lg leading-none"
                        title="Eltávolítás"
                      >
                        &times;
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Right: Available models pool */}
          <div>
            <h4 className="text-xs text-slate-400 uppercase tracking-wide mb-2">
              Elérhető modellek
            </h4>
            <p className="text-[10px] text-slate-600 mb-3">
              Húzd az egyik modellt balra az elsődleges vagy tartalék helyre.
              Az előfizetésben foglalt modellek ingyenesek; az API modellekhez API kulcs szükséges.
            </p>
            <div className="space-y-1.5 max-h-[350px] overflow-y-auto pr-1">
              {unusedModels.length === 0 ? (
                <p className="text-sm text-slate-600 italic p-3">
                  Minden elérhető modell már hozzá van rendelve
                </p>
              ) : (
                unusedModels.map((m) => (
                  <div
                    key={m.id}
                    draggable={m.hasApiKey}
                    onDragStart={(e) => m.hasApiKey && handleDragStart(e, m.id)}
                    className={`flex items-center gap-2 px-3 py-2.5 border rounded-lg transition-all ${
                      m.hasApiKey
                        ? 'bg-slate-800/40 border-slate-700/40 cursor-grab active:cursor-grabbing hover:border-slate-600 hover:bg-slate-800/60'
                        : 'bg-slate-900/30 border-slate-800/30 opacity-50 cursor-not-allowed'
                    }`}
                  >
                    <svg className="w-3.5 h-3.5 text-slate-600 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8h16M4 16h16" />
                    </svg>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded ${providerBadge(m.id)}`}>
                      {m.provider}
                    </span>
                    <span className="text-sm text-slate-200 font-mono">{m.name}</span>
                    <span className={`text-[9px] px-1.5 py-0.5 rounded ml-auto flex-shrink-0 ${
                      m.tier === 'subscription'
                        ? 'bg-emerald-900/50 text-emerald-300'
                        : m.hasApiKey
                          ? 'bg-blue-900/50 text-blue-300'
                          : 'bg-red-900/50 text-red-300'
                    }`}>
                      {m.tier === 'subscription'
                        ? 'Előfizetés'
                        : m.hasApiKey
                          ? 'API'
                          : 'Nincs kulcs'}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 mt-6 pt-4 border-t border-slate-800">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-slate-400 hover:text-slate-200 text-sm transition-colors"
          >
            Mégse
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || !primary}
            className="px-5 py-2 bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
          >
            {saving ? 'Mentés...' : 'Mentés'}
          </button>
        </div>
      </div>
    </div>
  );
}

function LiveActivityFeed({ activities, loading }: { activities: ActivityWithAgent[]; loading: boolean }) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = 0;
    }
  }, [activities.length]);

  return (
    <div className="border border-slate-800 rounded-xl bg-slate-900/30 flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800">
        <h3 className="text-sm font-semibold text-slate-200">Élő tevékenység</h3>
        {loading && <span className="text-[10px] text-slate-500">Betöltés...</span>}
      </div>
      <div ref={scrollRef} className="flex-1 overflow-y-auto max-h-[600px] divide-y divide-slate-800/50">
        {activities.length === 0 ? (
          <div className="p-6 text-center text-sm text-slate-600">Nincs tevékenység</div>
        ) : (
          activities.map((entry, i) => (
            <div key={`${entry.ts}-${i}`} className="px-4 py-2.5 hover:bg-slate-800/20 transition-colors">
              <div className="flex items-center gap-2 mb-0.5">
                <span className="text-xs">{entry.agentEmoji}</span>
                <span className="text-xs font-medium text-slate-300">{entry.agentName}</span>
                <span className="text-[10px] text-slate-600 ml-auto">{relativeTime(entry.ts)}</span>
              </div>
              {entry.type === 'comment' ? (
                <div className="text-xs text-slate-400">
                  <span className="text-amber-400/80 font-mono mr-1">T-{entry.taskShortId}</span>
                  {truncate(entry.content, 80)}
                </div>
              ) : (
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-slate-400">{entry.jobName}</span>
                  <span className={`px-1.5 py-0.5 rounded text-[10px] ${
                    entry.status === 'success' ? 'bg-emerald-900/50 text-emerald-300' : 'bg-red-900/50 text-red-300'
                  }`}>
                    {entry.status}
                  </span>
                  <span className="text-slate-500">{formatTokens(entry.tokens)} tok</span>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function PerformanceSummary({ agents }: { agents: AgentData[] }) {
  const totalCompleted = agents.reduce((s, a) => s + (a.stats?.completedTasks ?? 0), 0);
  const totalCost = agents.reduce((s, a) => s + (a.stats?.totalCost ?? 0), 0);
  const totalTokens = agents.reduce((s, a) => s + (a.stats?.totalTokens ?? 0), 0);
  const totalRuns = agents.reduce((s, a) => s + (a.stats?.totalRuns ?? 0), 0);
  const totalSuccess = agents.reduce((s, a) => s + (a.stats?.successfulRuns ?? 0), 0);
  const overallRate = totalRuns > 0 ? Math.round((totalSuccess / totalRuns) * 100) : 0;
  const avgCostPerTask = totalCompleted > 0 ? totalCost / totalCompleted : 0;

  const ranked = [...agents]
    .filter((a) => (a.stats?.completedTasks ?? 0) > 0)
    .sort((a, b) => (a.stats?.costPerTask ?? 0) - (b.stats?.costPerTask ?? 0));

  return (
    <div className="mt-8">
      <h3 className="text-sm font-semibold text-slate-200 mb-4 uppercase tracking-wide">Összesített teljesítmény</h3>
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-6">
        <SummaryBox label="Elvégzett feladatok" value={(totalCompleted ?? 0).toLocaleString('hu-HU')} color="text-emerald-400" />
        <SummaryBox label="Összes költség" value={formatCost(totalCost)} color="text-blue-400" />
        <SummaryBox label="Átl. költség/task" value={formatCost(avgCostPerTask)} color="text-amber-400" />
        <SummaryBox label="Sikeresség" value={`${overallRate}%`} color="text-purple-400" />
        <SummaryBox label="Összes token" value={formatTokens(totalTokens)} color="text-slate-300" />
      </div>

      {ranked.length > 0 && (
        <div>
          <p className="text-xs text-slate-500 uppercase tracking-wide mb-2">Hatékonysági rangsor (költség/task)</p>
          <div className="space-y-1">
            {ranked.map((agent, i) => {
              const t = themeOf(agent);
              return (
                <div key={agent.id} className="flex items-center gap-3 text-xs px-3 py-2 bg-slate-800/30 rounded-lg">
                  <span className="text-slate-500 font-mono w-5 text-right">#{i + 1}</span>
                  <span>{agent.identity?.emoji}</span>
                  <span className={`font-medium ${t.text}`}>{agent.identity?.name || agent.name}</span>
                  <span className="ml-auto text-slate-400 font-mono">{formatCost(agent.stats?.costPerTask)}/task</span>
                  <span className="text-slate-500">{Math.round(agent.stats?.successRate ?? 0)}% siker</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function SummaryBox({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="border border-slate-800 rounded-xl p-3 bg-slate-900/30 text-center">
      <p className="text-[10px] text-slate-500 uppercase tracking-wide">{label}</p>
      <p className={`text-xl font-bold mt-1 ${color}`}>{value}</p>
    </div>
  );
}

function AddAgentModal({ onClose, onCreated, defaultModel }: { onClose: () => void; onCreated: () => void; defaultModel: string }) {
  const [id, setId] = useState('');
  const [name, setName] = useState('');
  const [theme, setTheme] = useState('general');
  const [emoji, setEmoji] = useState('🤖');
  const [model, setModel] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id.trim() || !name.trim()) return;
    setSubmitting(true);
    setError('');
    try {
      await api.agents.create({
        id: id.trim().toLowerCase(),
        name: name.trim(),
        theme,
        emoji,
        model: model.trim() || undefined,
      });
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Hiba történt');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 w-full max-w-md shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-semibold text-slate-100 mb-4">Új ügynök létrehozása</h2>

        {error && (
          <div className="mb-3 p-3 bg-red-900/30 border border-red-800 rounded-lg text-red-300 text-sm">{error}</div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="text-xs text-slate-400 mb-1 block">ID (kisbetűs)</label>
            <input
              value={id} onChange={(e) => setId(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ''))}
              placeholder="agent-id"
              className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/50"
              required
            />
          </div>
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Név</label>
            <input
              value={name} onChange={(e) => setName(e.target.value)}
              placeholder="Ügynök neve"
              className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/50"
              required
            />
          </div>
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Téma</label>
            <select
              value={theme} onChange={(e) => setTheme(e.target.value)}
              className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/50"
            >
              <option value="orchestrator">Orchestrator</option>
              <option value="developer">Developer</option>
              <option value="marketing">Marketing</option>
              <option value="security">Security</option>
              <option value="general">General</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Emoji</label>
            <input
              value={emoji} onChange={(e) => setEmoji(e.target.value)}
              className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/50"
            />
          </div>
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Modell (opcionális)</label>
            <input
              value={model} onChange={(e) => setModel(e.target.value)}
              placeholder={defaultModel || 'Alapértelmezett modell'}
              className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/50"
            />
          </div>
          <div className="flex gap-2 pt-2">
            <button
              type="submit" disabled={submitting}
              className="flex-1 px-4 py-2 bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
            >
              {submitting ? 'Létrehozás...' : 'Létrehozás'}
            </button>
            <button
              type="button" onClick={onClose}
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

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function AgentsDashboard() {
  const [agents, setAgents] = useState<AgentData[]>([]);
  const [defaults, setDefaults] = useState<AgentsResponse['defaults'] | null>(null);
  const [activities, setActivities] = useState<ActivityWithAgent[]>([]);
  const [availableModels, setAvailableModels] = useState<AvailableModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [activityLoading, setActivityLoading] = useState(false);
  const [error, setError] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [modelConfigAgent, setModelConfigAgent] = useState<AgentData | null>(null);

  const loadAgents = useCallback(async () => {
    try {
      setError('');
      const data: AgentsResponse = await api.agents.list();
      setAgents(data.agents);
      setDefaults(data.defaults);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Hiba az ügynökök betöltésénél');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadModels = useCallback(async () => {
    try {
      const data = await api.agents.availableModels();
      setAvailableModels(data.models);
    } catch {
      // silently fail
    }
  }, []);

  const loadActivities = useCallback(async (agentList: AgentData[]) => {
    if (agentList.length === 0) return;
    setActivityLoading(true);
    try {
      const results = await Promise.allSettled(
        agentList.map(async (agent) => {
          const entries: ActivityEntry[] = await api.agents.activity(agent.id, 30);
          return entries.map((e) => ({
            ...e,
            agentId: agent.id,
            agentEmoji: agent.identity?.emoji || '🤖',
            agentName: agent.identity?.name || agent.name,
          }));
        })
      );
      const all: ActivityWithAgent[] = results
        .filter((r): r is PromiseFulfilledResult<ActivityWithAgent[]> => r.status === 'fulfilled')
        .flatMap((r) => r.value)
        .sort((a, b) => b.ts - a.ts)
        .slice(0, 50);
      setActivities(all);
    } catch {
      // silently fail for activity feed
    } finally {
      setActivityLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAgents();
    loadModels();
  }, [loadAgents, loadModels]);

  useEffect(() => {
    if (agents.length > 0) {
      loadActivities(agents);
    }
  }, [agents, loadActivities]);

  // Polling
  useEffect(() => {
    const agentInterval = setInterval(loadAgents, 15_000);
    return () => clearInterval(agentInterval);
  }, [loadAgents]);

  useEffect(() => {
    if (agents.length === 0) return;
    const actInterval = setInterval(() => loadActivities(agents), 20_000);
    return () => clearInterval(actInterval);
  }, [agents, loadActivities]);

  const handleRefresh = () => {
    loadAgents();
    loadModels();
    if (agents.length > 0) loadActivities(agents);
  };

  const handleAgentCreated = () => {
    setShowAddModal(false);
    loadAgents();
  };

  const handleModelConfigSaved = () => {
    setModelConfigAgent(null);
    loadAgents();
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-pulse text-slate-400">Ügynökök betöltése...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="border-b border-slate-800 bg-slate-900/50 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link to="/" className="text-sm text-slate-400 hover:text-slate-200 transition-colors">
              ← Projektlista
            </Link>
            <div className="flex items-center gap-3">
              <h1 className="text-xl font-semibold text-slate-100">Ügynökök Központ</h1>
              <span className="px-2 py-0.5 bg-slate-800 text-slate-400 text-xs rounded-full font-mono">
                {agents.length}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {/* Live indicator */}
            <div className="flex items-center gap-1.5 mr-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-xs text-emerald-400 font-medium">Élő</span>
            </div>
            <button
              onClick={handleRefresh}
              className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-200 text-sm font-medium rounded-lg transition-colors"
            >
              Frissítés
            </button>
            <button
              onClick={() => setShowAddModal(true)}
              className="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white text-sm font-medium rounded-lg transition-colors"
            >
              + Új ügynök
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6">
        {error && (
          <div className="mb-4 p-4 bg-red-900/30 border border-red-800 rounded-lg text-red-300 text-sm">{error}</div>
        )}

        {/* Network visualization */}
        <AgentNetworkVisualization agents={agents} />

        {/* Main grid: cards + activity feed */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Agent cards */}
          <div className="lg:col-span-2">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {agents.map((agent) => (
                <AgentDetailCard
                  key={agent.id}
                  agent={agent}
                  onConfigureModel={setModelConfigAgent}
                />
              ))}
            </div>
          </div>

          {/* Activity feed */}
          <div className="lg:col-span-1">
            <LiveActivityFeed activities={activities} loading={activityLoading} />
          </div>
        </div>

        {/* Performance summary */}
        {agents.length > 0 && <PerformanceSummary agents={agents} />}
      </main>

      {/* Add agent modal */}
      {showAddModal && (
        <AddAgentModal
          onClose={() => setShowAddModal(false)}
          onCreated={handleAgentCreated}
          defaultModel={defaults?.model || ''}
        />
      )}

      {/* Model config modal */}
      {modelConfigAgent && (
        <ModelConfigModal
          agent={modelConfigAgent}
          availableModels={availableModels}
          onClose={() => setModelConfigAgent(null)}
          onSaved={handleModelConfigSaved}
        />
      )}
    </div>
  );
}
