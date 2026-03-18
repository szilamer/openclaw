import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  AreaChart, Area, Legend, ComposedChart, Line, ReferenceLine,
} from 'recharts';

// ---------------------------------------------------------------------------
// Budget & Model types
// ---------------------------------------------------------------------------

interface BudgetConfig {
  dailyMaxUsd: number | null;
  warningThresholdPct: number;
  strategy: 'skip' | 'fallback' | 'warn';
  fallbackModel: string | null;
}

interface AvailableModel {
  id: string;
  provider: string;
  name: string;
  tier: 'subscription' | 'api';
  hasApiKey: boolean;
}

interface AgentModelInfo {
  id: string;
  name: string;
  emoji: string;
  theme: string;
  model: string;
  fallbacks: string[];
}

function UsageGauge({ label, used, max, unit = '', color = 'amber', showCost }: {
  label: string; used: number; max: number; unit?: string; color?: string; showCost?: string;
}) {
  const pct = max > 0 ? Math.min(100, Math.round((used / max) * 100)) : 0;
  const barColor = pct > 90 ? 'bg-red-500' : pct > 70 ? 'bg-yellow-500' : `bg-${color}-500`;
  const textColor = pct > 90 ? 'text-red-400' : pct > 70 ? 'text-yellow-400' : `text-${color}-400`;

  return (
    <div className="border border-slate-700 rounded-xl p-4 bg-slate-900/30">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs text-slate-500 uppercase tracking-wide">{label}</p>
        {showCost && <span className="text-xs text-emerald-400 font-mono">{showCost}</span>}
      </div>
      <div className="flex items-baseline gap-2 mb-2">
        <span className={`text-2xl font-bold ${textColor}`}>{used.toLocaleString('hu-HU')}</span>
        <span className="text-sm text-slate-500">/ {max.toLocaleString('hu-HU')} {unit}</span>
      </div>
      <div className="w-full h-2.5 bg-slate-800 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${barColor}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="text-xs text-slate-600 mt-1">{pct}% kihasználva</p>
    </div>
  );
}

function StatCard({ label, value, sub, color = 'amber' }: { label: string; value: string | number; sub?: string; color?: string }) {
  const colors: Record<string, string> = {
    amber: 'border-amber-600/30 bg-amber-900/10',
    emerald: 'border-emerald-600/30 bg-emerald-900/10',
    red: 'border-red-600/30 bg-red-900/10',
    blue: 'border-blue-600/30 bg-blue-900/10',
    purple: 'border-purple-600/30 bg-purple-900/10',
  };
  const textColors: Record<string, string> = {
    amber: 'text-amber-400',
    emerald: 'text-emerald-400',
    red: 'text-red-400',
    blue: 'text-blue-400',
    purple: 'text-purple-400',
  };
  return (
    <div className={`border rounded-xl p-4 ${colors[color]}`}>
      <p className="text-xs text-slate-500 uppercase tracking-wide">{label}</p>
      <p className={`text-2xl font-bold mt-1 ${textColors[color]}`}>{typeof value === 'number' ? value.toLocaleString('hu-HU') : value}</p>
      {sub && <p className="text-xs text-slate-600 mt-0.5">{sub}</p>}
    </div>
  );
}

function AgentCard({ agent }: { agent: any }) {
  const themeColors: Record<string, string> = {
    orchestrator: 'border-amber-600/40',
    developer: 'border-blue-600/40',
    marketing: 'border-purple-600/40',
    security: 'border-red-600/40',
  };
  return (
    <div className={`border rounded-xl p-3 bg-slate-800/30 ${themeColors[agent.identity?.theme] || 'border-slate-700'}`}>
      <div className="flex items-center gap-2">
        <span className="text-lg">{agent.identity?.emoji || ''}</span>
        <div>
          <p className="text-sm font-medium text-slate-200">{agent.name}</p>
          <p className="text-xs text-slate-500">{agent.identity?.theme || agent.id}</p>
        </div>
      </div>
      <div className="mt-2 text-xs text-slate-400 space-y-0.5">
        <p>Modell: <span className="text-slate-300 font-mono">{agent.model?.split('/').pop()}</span></p>
        <p>Sandbox: <span className={agent.sandbox === 'off' ? 'text-yellow-500' : 'text-emerald-400'}>{agent.sandbox}</span></p>
      </div>
    </div>
  );
}

function CronJobRow({ job }: { job: any }) {
  const lastRun = job.state?.lastRunAtMs
    ? new Date(job.state.lastRunAtMs).toLocaleString('hu-HU')
    : '—';
  const duration = job.state?.lastDurationMs
    ? `${(job.state.lastDurationMs / 1000).toFixed(0)}s`
    : '—';
  const interval = job.schedule?.expr || (job.schedule?.everyMs ? `${Math.round(job.schedule.everyMs / 60000)}m` : '?');

  return (
    <tr className="border-b border-slate-800 hover:bg-slate-800/30">
      <td className="px-3 py-2">
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${job.enabled ? 'bg-emerald-400' : 'bg-slate-600'}`} />
          <span className="text-sm text-slate-200">{job.name}</span>
        </div>
      </td>
      <td className="px-3 py-2 text-xs text-slate-400 font-mono">{interval}</td>
      <td className="px-3 py-2">
        <span className={`text-xs px-1.5 py-0.5 rounded ${
          job.state?.lastStatus === 'ok' ? 'bg-emerald-900/50 text-emerald-400' :
          job.state?.lastStatus === 'error' ? 'bg-red-900/50 text-red-400' :
          'bg-slate-700 text-slate-400'
        }`}>
          {job.state?.lastStatus || '—'}
        </span>
      </td>
      <td className="px-3 py-2 text-xs text-slate-400">{lastRun}</td>
      <td className="px-3 py-2 text-xs text-slate-400 font-mono">{duration}</td>
      <td className="px-3 py-2 text-xs text-slate-500">{job.state?.consecutiveErrors || 0}</td>
    </tr>
  );
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function formatUsd(n: number): string {
  if (n < 0.01) return '<$0.01';
  return `$${n.toFixed(2)}`;
}

const chartTooltipStyle = {
  contentStyle: { backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '8px', fontSize: '12px' },
  labelStyle: { color: '#94a3b8' },
};

// ---------------------------------------------------------------------------
// Budget Settings Panel
// ---------------------------------------------------------------------------

function BudgetSettingsPanel({
  budget,
  availableModels,
  onSave,
}: {
  budget: BudgetConfig;
  availableModels: AvailableModel[];
  onSave: (b: Partial<BudgetConfig>) => Promise<void>;
}) {
  const [dailyMax, setDailyMax] = useState(budget.dailyMaxUsd?.toString() ?? '');
  const [warnPct, setWarnPct] = useState(budget.warningThresholdPct.toString());
  const [strategy, setStrategy] = useState(budget.strategy);
  const [fbModel, setFbModel] = useState(budget.fallbackModel ?? '');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave({
        dailyMaxUsd: dailyMax ? parseFloat(dailyMax) : null,
        warningThresholdPct: parseInt(warnPct) || 80,
        strategy,
        fallbackModel: fbModel || null,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  };

  const STRATEGY_INFO: Record<string, { label: string; desc: string; color: string }> = {
    skip: {
      label: 'Kihagyás',
      desc: 'Ha a napi keret elfogyott, a feladat nem indul el. Legbiztonságosabb opció.',
      color: 'text-red-400',
    },
    fallback: {
      label: 'Olcsóbb modellre váltás',
      desc: 'Kerettúllépés esetén automatikusan az alább kiválasztott olcsóbb modellre vált.',
      color: 'text-amber-400',
    },
    warn: {
      label: 'Csak figyelmeztetés',
      desc: 'A feladat elindul figyelmeztetéssel — a költség túllépheti a keretet.',
      color: 'text-blue-400',
    },
  };

  return (
    <div className="border border-slate-700 rounded-xl p-5 bg-slate-900/40">
      <h3 className="text-sm font-semibold text-slate-200 mb-1">Költségkeret védelem</h3>
      <p className="text-xs text-slate-500 mb-4">
        Automatikus védelem a túlköltés ellen. Ha a napi LLM költés eléri a limitet, a választott stratégia lép életbe.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
        <div>
          <label className="text-xs text-slate-400 mb-1 block">Napi limit (USD)</label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-sm">$</span>
            <input
              type="number"
              step="0.5"
              min="0"
              value={dailyMax}
              onChange={(e) => setDailyMax(e.target.value)}
              placeholder="pl. 5.00"
              className="w-full pl-7 pr-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/50"
            />
          </div>
          <p className="text-[10px] text-slate-600 mt-1">
            Hagyd üresen a korlátlan költés engedélyezéséhez
          </p>
        </div>
        <div>
          <label className="text-xs text-slate-400 mb-1 block">Figyelmeztető küszöb (%)</label>
          <input
            type="number"
            min="0"
            max="100"
            value={warnPct}
            onChange={(e) => setWarnPct(e.target.value)}
            className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/50"
          />
          <p className="text-[10px] text-slate-600 mt-1">
            Ennél a százaléknál logol figyelmeztetést (alapért.: 80%)
          </p>
        </div>
      </div>

      <div className="mb-4">
        <label className="text-xs text-slate-400 mb-2 block">Kerettúllépési stratégia</label>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          {(Object.entries(STRATEGY_INFO) as [typeof strategy, typeof STRATEGY_INFO[string]][]).map(
            ([key, info]) => (
              <button
                key={key}
                type="button"
                onClick={() => setStrategy(key)}
                className={`p-3 rounded-lg border text-left transition-all ${
                  strategy === key
                    ? 'border-amber-500/60 bg-amber-900/20'
                    : 'border-slate-700 bg-slate-800/30 hover:border-slate-600'
                }`}
              >
                <div className={`text-sm font-medium ${info.color}`}>{info.label}</div>
                <p className="text-[10px] text-slate-500 mt-1 leading-relaxed">{info.desc}</p>
              </button>
            ),
          )}
        </div>
      </div>

      {strategy === 'fallback' && (
        <div className="mb-4">
          <label className="text-xs text-slate-400 mb-1 block">Tartalék modell kerettúllépésnél</label>
          <select
            value={fbModel}
            onChange={(e) => setFbModel(e.target.value)}
            className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/50"
          >
            <option value="">— Válassz modellt —</option>
            {availableModels.map((m) => (
              <option key={m.id} value={m.id}>
                {m.provider}/{m.name}
              </option>
            ))}
          </select>
          <p className="text-[10px] text-slate-600 mt-1">
            Erre a (jellemzően olcsóbb) modellre vált, ha elérte a napi keretet
          </p>
        </div>
      )}

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="px-5 py-2 bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
        >
          {saving ? 'Mentés...' : 'Mentés'}
        </button>
        {saved && <span className="text-xs text-emerald-400">Mentve!</span>}
      </div>
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
  agent: AgentModelInfo;
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
          <span className="text-2xl">{agent.emoji || '🤖'}</span>
          <h2 className="text-lg font-semibold text-slate-100">
            {agent.name} — Modell beállítások
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

// ---------------------------------------------------------------------------
// Agent Model Overview Row
// ---------------------------------------------------------------------------

const AGENT_THEME_CLASSES: Record<string, { border: string; bg: string; text: string }> = {
  orchestrator: { border: 'border-amber-600/40', bg: 'bg-amber-900/10', text: 'text-amber-400' },
  developer: { border: 'border-blue-600/40', bg: 'bg-blue-900/10', text: 'text-blue-400' },
  marketing: { border: 'border-purple-600/40', bg: 'bg-purple-900/10', text: 'text-purple-400' },
  security: { border: 'border-red-600/40', bg: 'bg-red-900/10', text: 'text-red-400' },
  general: { border: 'border-slate-600/40', bg: 'bg-slate-800/10', text: 'text-slate-400' },
};

function agentTheme(theme: string) {
  return AGENT_THEME_CLASSES[theme] ?? AGENT_THEME_CLASSES.general;
}

function QuotaStatusPanel({ quota }: { quota: any }) {
  if (!quota || quota.error) return null;

  const isRateLimited = quota.rateLimited;
  const hourlyPct = quota.hourly?.pctLeft ?? -1;
  const weeklyPct = quota.weekly?.pctLeft ?? -1;
  const hourlyReset = quota.hourly?.resetIn || '?';
  const weeklyReset = quota.weekly?.resetIn || '?';
  const tokenExpires = quota.tokenExpires || '?';
  const tokenStatus = quota.tokenStatus || 'unknown';
  const ollamaOk = quota.ollama?.available;
  const ollamaModels = quota.ollama?.models || [];
  const ageMs = Date.now() - (quota.ts || 0);
  const ageMins = Math.round(ageMs / 60000);
  const stale = ageMins > 10;

  const hourlyBarColor =
    hourlyPct <= 10 ? 'bg-red-500' : hourlyPct <= 30 ? 'bg-yellow-500' : 'bg-emerald-500';
  const weeklyBarColor =
    weeklyPct <= 10 ? 'bg-red-500' : weeklyPct <= 30 ? 'bg-yellow-500' : 'bg-emerald-500';

  return (
    <div
      className={`border rounded-xl p-5 ${
        isRateLimited
          ? 'border-red-600/60 bg-red-950/30'
          : 'border-emerald-600/30 bg-slate-900/40'
      }`}
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span
            className={`w-3 h-3 rounded-full ${
              isRateLimited ? 'bg-red-500 animate-pulse' : 'bg-emerald-500'
            }`}
          />
          <h2 className="text-sm font-semibold text-slate-200">
            OpenAI Codex OAuth kvóta
          </h2>
          {isRateLimited && (
            <span className="px-2 py-0.5 text-[10px] font-bold bg-red-900/60 text-red-300 rounded-full border border-red-700/50 uppercase tracking-wide">
              Rate Limited
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {stale && (
            <span className="text-[10px] text-yellow-500">frissítés nem elérhető</span>
          )}
          <span className="text-[10px] text-slate-600">
            {ageMins < 1 ? 'most frissítve' : `${ageMins} perce frissítve`}
          </span>
        </div>
      </div>

      {isRateLimited && (
        <div className="mb-4 p-3 bg-red-900/20 border border-red-800/40 rounded-lg">
          <p className="text-sm text-red-300">
            A modell kvóta elfogyott.{' '}
            {weeklyPct === 0
              ? `A heti kvóta ${weeklyReset} múlva frissül.`
              : `Az órás kvóta ${hourlyReset} múlva frissül.`}
          </p>
          <p className="text-xs text-red-400/70 mt-1">
            Addig a lokális Ollama modell ({ollamaModels.map((m: any) => m.name).join(', ') || '?'}) átveszi a feladatokat.
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Hourly quota */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-slate-500">Órás kvóta</span>
            <span className="text-xs text-slate-400 font-mono">
              {hourlyPct >= 0 ? `${hourlyPct}%` : '?'}
            </span>
          </div>
          <div className="h-2.5 bg-slate-800 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${hourlyBarColor}`}
              style={{ width: `${Math.max(0, hourlyPct)}%` }}
            />
          </div>
          <p className="text-[10px] text-slate-600 mt-1">
            Frissül: {hourlyReset}
          </p>
        </div>

        {/* Weekly quota */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-slate-500">Heti kvóta</span>
            <span className="text-xs text-slate-400 font-mono">
              {weeklyPct >= 0 ? `${weeklyPct}%` : '?'}
            </span>
          </div>
          <div className="h-2.5 bg-slate-800 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${weeklyBarColor}`}
              style={{ width: `${Math.max(0, weeklyPct)}%` }}
            />
          </div>
          <p className="text-[10px] text-slate-600 mt-1">
            Frissül: {weeklyReset}
          </p>
        </div>

        {/* OAuth token */}
        <div className="border border-slate-700 rounded-lg p-3 bg-slate-800/20">
          <p className="text-xs text-slate-500 mb-1">OAuth token</p>
          <div className="flex items-center gap-2">
            <span
              className={`w-2 h-2 rounded-full ${
                tokenStatus === 'ok'
                  ? 'bg-emerald-400'
                  : tokenStatus === 'expired'
                    ? 'bg-red-400'
                    : 'bg-yellow-400'
              }`}
            />
            <span
              className={`text-sm font-medium ${
                tokenStatus === 'ok' ? 'text-emerald-400' : 'text-red-400'
              }`}
            >
              {tokenStatus === 'ok' ? 'Aktív' : tokenStatus === 'expired' ? 'Lejárt' : tokenStatus}
            </span>
          </div>
          <p className="text-[10px] text-slate-600 mt-1">
            Lejárat: {tokenExpires}
          </p>
        </div>

        {/* Local LLM */}
        <div className="border border-slate-700 rounded-lg p-3 bg-slate-800/20">
          <p className="text-xs text-slate-500 mb-1">Helyi LLM (Ollama)</p>
          <div className="flex items-center gap-2">
            <span
              className={`w-2 h-2 rounded-full ${ollamaOk ? 'bg-emerald-400' : 'bg-red-400'}`}
            />
            <span
              className={`text-sm font-medium ${
                ollamaOk ? 'text-emerald-400' : 'text-red-400'
              }`}
            >
              {ollamaOk ? 'Elérhető' : 'Nem elérhető'}
            </span>
          </div>
          {ollamaModels.length > 0 && (
            <div className="mt-1 space-y-0.5">
              {ollamaModels.map((m: any) => (
                <p key={m.name} className="text-[10px] text-slate-500">
                  {m.name}{' '}
                  <span className="text-slate-600">
                    ({m.params}, {(m.size / 1_073_741_824).toFixed(1)}GB)
                  </span>
                </p>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function Resources() {
  const [data, setData] = useState<any>(null);
  const [quota, setQuota] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [agentsData, setAgentsData] = useState<{ agents: AgentModelInfo[]; defaults: any } | null>(null);
  const [availableModels, setAvailableModels] = useState<AvailableModel[]>([]);
  const [modelConfigAgent, setModelConfigAgent] = useState<AgentModelInfo | null>(null);

  const load = async () => {
    try {
      setError('');
      const [summary, quotaData] = await Promise.all([
        api.resources.summary(),
        api.resources.quota().catch(() => null),
      ]);
      setData(summary);
      setQuota(quotaData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Hiba');
    } finally {
      setLoading(false);
    }
  };

  const loadAgentsAndModels = useCallback(async () => {
    try {
      const [agData, modData] = await Promise.all([
        api.agents.list(),
        api.agents.availableModels(),
      ]);
      setAgentsData({
        agents: (agData.agents || []).map((a: any) => ({
          id: a.id,
          name: a.identity?.name || a.name || a.id,
          emoji: a.identity?.emoji || '🤖',
          theme: a.identity?.theme || 'general',
          model: a.model || 'unknown',
          fallbacks: a.fallbacks || [],
        })),
        defaults: agData.defaults,
      });
      setAvailableModels(modData.models || []);
    } catch {
      // silently fail
    }
  }, []);

  useEffect(() => {
    load();
    loadAgentsAndModels();
  }, [loadAgentsAndModels]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-pulse text-slate-400">Betöltés...</div>
      </div>
    );
  }

  const { config, jobs, dailyUsage, totals, plan, today } = data || {
    config: {}, jobs: [], dailyUsage: [], totals: {}, plan: {}, today: {},
  };

  const chartData = (dailyUsage || []).map((d: any) => ({
    ...d,
    date: d.date.slice(5),
    tokenK: Math.round(d.totalTokens / 1000),
    durationMin: Math.round(d.totalDurationMs / 60000),
    costUsd: Math.round((d.costUsd || 0) * 100) / 100,
  }));

  const avgTokensPerDay = totals.daysTracked > 0 ? Math.round(totals.tokens / totals.daysTracked) : 0;
  const avgCostPerDay = totals.daysTracked > 0 ? totals.costUsd / totals.daysTracked : 0;
  const projectedMonthlyCost = avgCostPerDay * 30;

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-slate-800 bg-slate-900/50 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link to="/" className="text-slate-400 hover:text-slate-200 transition-colors">← Projektlista</Link>
            <h1 className="text-lg font-semibold text-slate-100">Erőforrások</h1>
            {plan?.label && (
              <span className="px-2 py-0.5 text-xs font-medium bg-amber-900/50 text-amber-400 rounded-full border border-amber-700/50">
                {plan.label} plan
              </span>
            )}
          </div>
          <button onClick={load} className="px-3 py-1 text-xs bg-slate-700 hover:bg-slate-600 text-slate-300 rounded transition-colors">
            Frissítés
          </button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6 space-y-6 flex-1">
        {error && (
          <div className="p-3 bg-red-900/30 border border-red-800 rounded-lg text-red-300 text-sm">{error}</div>
        )}

        {/* Quota Status - most prominent section */}
        <QuotaStatusPanel quota={quota} />

        {/* TODAY - Daily limits section */}
        <div>
          <h2 className="text-sm font-medium text-slate-400 uppercase tracking-wider mb-3">Mai nap ({today?.date})</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <UsageGauge
              label="Napi task limit"
              used={today?.taskLimitUsed || 0}
              max={plan?.dailyTasks || 25}
              unit="task"
              color="blue"
            />
            <UsageGauge
              label="Napi token felhasználás"
              used={Math.round((today?.totalTokens || 0) / 1000)}
              max={Math.round(((plan?.dailyTasks || 25) * (totals.avgTokensPerRun || 50000)) / 1000)}
              unit="K token"
              color="amber"
              showCost={formatUsd(today?.costUsd || 0)}
            />
            <UsageGauge
              label="Várt futások (konfig)"
              used={today?.cronRuns || 0}
              max={plan?.expectedRunsPerDay || 24}
              unit="futás"
              color="purple"
            />
            <div className="border border-slate-700 rounded-xl p-4 bg-slate-900/30">
              <p className="text-xs text-slate-500 uppercase tracking-wide">Mai költség (API ekvivalens)</p>
              <p className="text-2xl font-bold mt-1 text-emerald-400">{formatUsd(today?.costUsd || 0)}</p>
              <p className="text-xs text-slate-600 mt-1">
                Input: {formatTokens(today?.inputTokens || 0)} &middot; Output: {formatTokens(today?.outputTokens || 0)}
              </p>
              <p className="text-xs text-slate-600">
                Futásidő: {Math.round((today?.totalDurationMs || 0) / 60000)} perc
              </p>
            </div>
          </div>
        </div>

        {/* Period totals */}
        <div>
          <h2 className="text-sm font-medium text-slate-400 uppercase tracking-wider mb-3">
            {totals.daysTracked || 0} napos összesítés
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <StatCard label="Token összesen" value={formatTokens(totals.tokens || 0)} sub={`${formatTokens(avgTokensPerDay)}/nap átlag`} color="amber" />
            <StatCard label="API költség" value={formatUsd(totals.costUsd || 0)} sub={`~${formatUsd(projectedMonthlyCost)}/hó (vetített)`} color="emerald" />
            <StatCard label="Cron futások" value={totals.cronRuns || 0} sub={`${totals.enabledJobs || 0}/${totals.totalJobs || 0} aktív job`} color="blue" />
            <StatCard label="Cron hibák" value={totals.cronErrors || 0} sub={totals.cronRuns ? `${Math.round((totals.cronErrors / totals.cronRuns) * 100)}% hibaarány` : ''} color={totals.cronErrors > 0 ? 'red' : 'emerald'} />
            <StatCard label="Agent műveletek" value={totals.agentActions || 0} sub="task + státuszváltás" color="purple" />
            <StatCard label="Átl. token/futás" value={formatTokens(totals.avgTokensPerRun || 0)} sub={`~${formatUsd(totals.avgCostPerRun || 0)}/futás`} color="amber" />
          </div>
        </div>

        {/* Cost + Token charts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="border border-slate-700 rounded-xl p-4 bg-slate-900/30">
            <h2 className="text-sm font-medium text-slate-300 mb-3">Napi token felhasználás vs. limit</h2>
            <ResponsiveContainer width="100%" height={250}>
              <ComposedChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#64748b' }} />
                <YAxis tick={{ fontSize: 11, fill: '#64748b' }} tickFormatter={(v: number) => `${v}K`} />
                <Tooltip {...chartTooltipStyle} formatter={(v: any, name: any) => {
                  if (name === 'tokenK') return [`${v}K token`, 'Felhasznált'];
                  return [v, name];
                }} />
                <ReferenceLine
                  y={Math.round(((plan?.dailyTasks || 25) * (totals.avgTokensPerRun || 50000)) / 1000)}
                  stroke="#ef4444"
                  strokeDasharray="5 5"
                  strokeWidth={1.5}
                  label={{ value: 'Becsült napi kapacitás', position: 'insideTopRight', fill: '#ef4444', fontSize: 10 }}
                />
                <Area type="monotone" dataKey="tokenK" stroke="#f59e0b" fill="#f59e0b" fillOpacity={0.15} strokeWidth={2} name="tokenK" />
              </ComposedChart>
            </ResponsiveContainer>
          </div>

          <div className="border border-slate-700 rounded-xl p-4 bg-slate-900/30">
            <h2 className="text-sm font-medium text-slate-300 mb-3">Napi költség (API ekvivalens)</h2>
            <ResponsiveContainer width="100%" height={250}>
              <ComposedChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#64748b' }} />
                <YAxis tick={{ fontSize: 11, fill: '#64748b' }} tickFormatter={(v: number) => `$${v}`} />
                <Tooltip {...chartTooltipStyle} formatter={(v: any) => [`$${Number(v).toFixed(2)}`, 'Költség']} />
                <ReferenceLine
                  y={Math.round(((plan?.monthlyCostUsd || 20) / 30) * 100) / 100}
                  stroke="#10b981"
                  strokeDasharray="5 5"
                  strokeWidth={1.5}
                  label={{ value: `${plan?.label} napi (~$${((plan?.monthlyCostUsd || 20) / 30).toFixed(1)})`, position: 'insideTopRight', fill: '#10b981', fontSize: 10 }}
                />
                <Area type="monotone" dataKey="costUsd" stroke="#10b981" fill="#10b981" fillOpacity={0.15} strokeWidth={2} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Cron runs + Agent actions chart */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="border border-slate-700 rounded-xl p-4 bg-slate-900/30">
            <h2 className="text-sm font-medium text-slate-300 mb-3">Napi cron futások vs. limit</h2>
            <ResponsiveContainer width="100%" height={200}>
              <ComposedChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#64748b' }} />
                <YAxis tick={{ fontSize: 11, fill: '#64748b' }} />
                <Tooltip {...chartTooltipStyle} />
                <ReferenceLine
                  y={plan?.dailyTasks || 25}
                  stroke="#ef4444"
                  strokeDasharray="5 5"
                  strokeWidth={1.5}
                  label={{ value: `${plan?.dailyTasks} task limit`, position: 'insideTopRight', fill: '#ef4444', fontSize: 10 }}
                />
                <Bar dataKey="cronRuns" fill="#3b82f6" name="Futások" radius={[3, 3, 0, 0]} />
                <Line type="monotone" dataKey="cronErrors" stroke="#ef4444" name="Hibák" strokeWidth={2} dot={{ r: 3 }} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>

          <div className="border border-slate-700 rounded-xl p-4 bg-slate-900/30">
            <h2 className="text-sm font-medium text-slate-300 mb-3">Agent műveletek (napi)</h2>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#64748b' }} />
                <YAxis tick={{ fontSize: 11, fill: '#64748b' }} />
                <Tooltip {...chartTooltipStyle} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="taskCreates" fill="#8b5cf6" name="Task létrehozás" stackId="a" radius={[0, 0, 0, 0]} />
                <Bar dataKey="statusChanges" fill="#a78bfa" name="Státuszváltás" stackId="a" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Execution time chart */}
        <div className="border border-slate-700 rounded-xl p-4 bg-slate-900/30">
          <h2 className="text-sm font-medium text-slate-300 mb-3">Napi futásidő (perc)</h2>
          <ResponsiveContainer width="100%" height={180}>
            <AreaChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#64748b' }} />
              <YAxis tick={{ fontSize: 11, fill: '#64748b' }} unit=" min" />
              <Tooltip {...chartTooltipStyle} formatter={(v: any) => [`${v} perc`, 'Futásidő']} />
              <Area type="monotone" dataKey="durationMin" stroke="#10b981" fill="#10b981" fillOpacity={0.15} strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Plan comparison */}
        <div className="border border-slate-700 rounded-xl p-4 bg-slate-900/30">
          <h2 className="text-sm font-medium text-slate-300 mb-3">Plan összehasonlítás & költséghatékonyság</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-700">
                  <th className="px-3 py-2 text-left text-xs font-medium text-slate-500">Plan</th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-slate-500">Ár/hó</th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-slate-500">Napi task</th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-slate-500">Párhuz.</th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-slate-500">Timeout</th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-slate-500">Becsült token/nap</th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-slate-500">API ekv. megtakarítás</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries({
                  plus:     { ...({} as any), label: 'Plus',     dailyTasks: 25,   concurrent: 1, timeout: 10, monthly: 20 },
                  pro:      { ...({} as any), label: 'Pro',      dailyTasks: 250,  concurrent: 3, timeout: 30, monthly: 200 },
                  max:      { ...({} as any), label: 'Max',      dailyTasks: 1000, concurrent: 5, timeout: 60, monthly: 200 },
                  business: { ...({} as any), label: 'Business', dailyTasks: 100,  concurrent: 2, timeout: 15, monthly: 25 },
                } as Record<string, any>).map(([key, p]) => {
                  const estTokensPerDay = p.dailyTasks * (totals.avgTokensPerRun || 50000);
                  const estApiCostPerDay = estTokensPerDay > 0
                    ? (estTokensPerDay * 0.7 / 1_000_000) * 2.0 + (estTokensPerDay * 0.3 / 1_000_000) * 10.0
                    : 0;
                  const estApiCostPerMonth = estApiCostPerDay * 30;
                  const savings = estApiCostPerMonth - p.monthly;
                  const isCurrentPlan = key === (plan?.key || 'plus');
                  return (
                    <tr key={key} className={`border-b border-slate-800 ${isCurrentPlan ? 'bg-amber-900/10' : 'hover:bg-slate-800/30'}`}>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-2">
                          <span className="text-slate-200 font-medium">{p.label}</span>
                          {isCurrentPlan && <span className="text-[10px] px-1.5 py-0.5 bg-amber-900/50 text-amber-400 rounded-full">aktív</span>}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-right text-slate-300 font-mono">${p.monthly}</td>
                      <td className="px-3 py-2 text-right text-slate-400">{p.dailyTasks}</td>
                      <td className="px-3 py-2 text-right text-slate-400">{p.concurrent}</td>
                      <td className="px-3 py-2 text-right text-slate-400">{p.timeout} perc</td>
                      <td className="px-3 py-2 text-right text-slate-400 font-mono">{formatTokens(estTokensPerDay)}</td>
                      <td className="px-3 py-2 text-right">
                        <span className={savings > 0 ? 'text-emerald-400 font-mono' : 'text-slate-500'}>
                          {savings > 0 ? `+$${Math.round(savings)}/hó` : '—'}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-slate-600 mt-2">
            * API ekvivalens megtakarítás = mit fizetnél API-n ugyanennyi tokenért, mínusz az előfizetés ára.
            Jelenlegi átl. token/futás: {formatTokens(totals.avgTokensPerRun || 0)} (~70% input, ~30% output arány becslés).
          </p>
        </div>

        {/* Auth & Agents */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="border border-slate-700 rounded-xl p-4 bg-slate-900/30">
            <h2 className="text-sm font-medium text-slate-300 mb-3">Hitelesítés & konfiguráció</h2>
            <div className="space-y-2">
              {(config.authProfiles || []).map((p: any) => (
                <div key={p.id} className="flex items-center justify-between p-2 bg-slate-800/50 rounded-lg">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-400" />
                    <span className="text-sm font-mono text-slate-200">{p.id}</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    <span className="px-1.5 py-0.5 bg-slate-700 rounded text-slate-400">{p.provider}</span>
                    <span className="px-1.5 py-0.5 bg-amber-900/50 rounded text-amber-400">{p.mode}</span>
                  </div>
                </div>
              ))}
            </div>

            <h3 className="text-xs font-medium text-slate-500 uppercase tracking-wide mt-4 mb-2">Alapértelmezések</h3>
            <div className="text-xs text-slate-400 space-y-1">
              <p>Modell: <span className="text-slate-200 font-mono">{config.defaults?.model || '?'}</span></p>
              <p>Heartbeat: <span className={`font-mono ${config.defaults?.heartbeat === '0m' ? 'text-red-400' : 'text-emerald-400'}`}>{config.defaults?.heartbeat || '?'}</span></p>
              <p>Max párhuzamos subagent: <span className="text-slate-200">{config.defaults?.maxConcurrentSubagents}</span></p>
              <p>Cron párhuzamosság: <span className="text-slate-200">{config.cron?.maxConcurrentRuns}</span></p>
            </div>
          </div>

          <div className="border border-slate-700 rounded-xl p-4 bg-slate-900/30">
            <h2 className="text-sm font-medium text-slate-300 mb-3">Agentek</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {(config.agents || []).map((a: any) => (
                <AgentCard key={a.id} agent={a} />
              ))}
            </div>
          </div>
        </div>

        {/* Budget Settings + Model Config */}
        {agentsData?.defaults?.budget && (
          <BudgetSettingsPanel
            budget={agentsData.defaults.budget}
            availableModels={availableModels}
            onSave={async (budgetData) => {
              await api.resources.updateBudget(budgetData);
              await loadAgentsAndModels();
            }}
          />
        )}

        {/* Per-agent model overview */}
        {agentsData && agentsData.agents.length > 0 && (
          <div className="border border-slate-700 rounded-xl p-5 bg-slate-900/30">
            <h2 className="text-sm font-medium text-slate-300 mb-1">Ügynök modell beállítások</h2>
            <p className="text-xs text-slate-500 mb-4">
              Kattints a „Beállítás" gombra bármely ügynöknél az elsődleges és tartalék modell konfigurálásához.
              A modellek drag-and-drop módszerrel rendezhetők.
            </p>

            {/* Default model info */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4 p-3 bg-slate-800/30 rounded-lg border border-slate-700/50">
              <div>
                <p className="text-[10px] text-slate-500 uppercase tracking-wide mb-1">Alapértelmezett modell</p>
                <p className="text-sm text-slate-200 font-mono">{agentsData.defaults?.model || '?'}</p>
              </div>
              <div>
                <p className="text-[10px] text-slate-500 uppercase tracking-wide mb-1">Alapért. tartalékok</p>
                <p className="text-sm text-slate-300 font-mono">
                  {agentsData.defaults?.fallbacks?.length > 0
                    ? agentsData.defaults.fallbacks.join(' → ')
                    : '—'}
                </p>
              </div>
            </div>

            <div className="space-y-2">
              {agentsData.agents.map((agent) => {
                const theme = agentTheme(agent.theme);
                return (
                  <div
                    key={agent.id}
                    className={`flex items-center gap-3 px-4 py-3 rounded-lg border ${theme.border} ${theme.bg} transition-all`}
                  >
                    <span className="text-lg">{agent.emoji}</span>
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-medium ${theme.text}`}>{agent.name}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-xs text-slate-400 font-mono">{agent.model}</span>
                        {agent.fallbacks?.length > 0 && (
                          <span className="text-[10px] text-slate-600">
                            → {agent.fallbacks.join(' → ')}
                          </span>
                        )}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setModelConfigAgent(agent)}
                      className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-600 rounded-lg text-xs text-slate-300 hover:text-amber-400 transition-colors flex items-center gap-1.5"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                      Beállítás
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Cron Jobs Table */}
        <div className="border border-slate-700 rounded-xl bg-slate-900/30 overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-700">
            <h2 className="text-sm font-medium text-slate-300">Cron feladatok</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-700">
                  <th className="px-3 py-2 text-left text-xs font-medium text-slate-500">Név</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-slate-500">Ütemezés</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-slate-500">Státusz</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-slate-500">Utolsó futás</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-slate-500">Időtartam</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-slate-500">Hibák</th>
                </tr>
              </thead>
              <tbody>
                {(jobs || []).map((job: any) => (
                  <CronJobRow key={job.id} job={job} />
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Token pricing info */}
        <div className="border border-slate-700 rounded-xl p-4 bg-slate-900/30">
          <h2 className="text-sm font-medium text-slate-300 mb-3">Token árazás (API referencia)</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-700">
                  <th className="px-3 py-2 text-left text-xs font-medium text-slate-500">Modell</th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-slate-500">Input / 1M token</th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-slate-500">Output / 1M token</th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-slate-500">Megjegyzés</th>
                </tr>
              </thead>
              <tbody>
                {data?.pricing && Object.entries(data.pricing).map(([model, p]: [string, any]) => (
                  <tr key={model} className="border-b border-slate-800">
                    <td className="px-3 py-2 text-slate-200 font-mono">{model}</td>
                    <td className="px-3 py-2 text-right text-slate-400 font-mono">${p.inputPer1M}</td>
                    <td className="px-3 py-2 text-right text-slate-400 font-mono">${p.outputPer1M}</td>
                    <td className="px-3 py-2 text-right text-xs text-slate-600">
                      {model === 'gpt-5.3-codex' ? 'Aktív modell' : 'Fallback'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-slate-600 mt-2">
            OAuth módban a tokenek az előfizetés részét képezik (nincs külön API díj). Az API ekvivalens költség összehasonlítási célokra szolgál.
          </p>
        </div>
      </main>

      {/* Model config modal */}
      {modelConfigAgent && (
        <ModelConfigModal
          agent={modelConfigAgent}
          availableModels={availableModels}
          onClose={() => setModelConfigAgent(null)}
          onSaved={() => {
            setModelConfigAgent(null);
            loadAgentsAndModels();
          }}
        />
      )}
    </div>
  );
}
