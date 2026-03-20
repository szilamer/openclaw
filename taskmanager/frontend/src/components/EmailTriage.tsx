import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import type {
  EmailTriageQueueRow,
  EmailTriageQueueStatus,
  Project,
  TriageRoutingRule,
} from '../types';

const STATUS_LABELS: Record<EmailTriageQueueStatus, string> = {
  fetched: 'Letöltve',
  irrelevant: 'Irreleváns',
  pending_review: 'Ellenőrzésre vár',
  approved: 'Jóváhagyva',
  rejected: 'Elvetve',
};

const STATUS_COLORS: Record<EmailTriageQueueStatus, string> = {
  fetched: 'bg-slate-700 text-slate-300',
  irrelevant: 'bg-slate-800 text-slate-500 line-through',
  pending_review: 'bg-amber-900/60 text-amber-200',
  approved: 'bg-emerald-900/60 text-emerald-200',
  rejected: 'bg-red-900/40 text-red-300',
};

const STAGE1_LABELS: Record<string, string> = {
  irrelevant: 'Irreleváns',
  relevant_unknown: 'Releváns (ismeretlen projekt)',
  classified: 'Besorolva',
};

const RULE_KINDS = [
  { value: 'sender_email', label: 'Küldő email (pontos)' },
  { value: 'sender_domain', label: 'Küldő domain' },
  { value: 'subject_contains', label: 'Tárgy tartalmazza' },
  { value: 'body_contains', label: 'Szöveg tartalmazza' },
  { value: 'regex_subject', label: 'Tárgy regex' },
] as const;

export function EmailTriage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [queue, setQueue] = useState<EmailTriageQueueRow[]>([]);
  const [rules, setRules] = useState<TriageRoutingRule[]>([]);
  const [filter, setFilter] = useState<EmailTriageQueueStatus | ''>('');
  const [hideIrrelevant, setHideIrrelevant] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<'queue' | 'rules'>('queue');

  const [localProject, setLocalProject] = useState<Record<string, string>>({});
  const [correctionReasons, setCorrectionReasons] = useState<Record<string, string>>({});
  const [expandedBody, setExpandedBody] = useState<Record<string, boolean>>({});
  const [ruleDraft, setRuleDraft] = useState<{
    triageId: string;
    kind: string;
    pattern: string;
    project_id: string;
  } | null>(null);

  const load = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const [p, q, r] = await Promise.all([
        api.projects.list(),
        api.emails.triageQueue(filter || undefined),
        api.emails.triageRules.list(),
      ]);
      setProjects(p);
      setQueue(q);
      setRules(r);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Betöltési hiba');
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    load();
  }, [load]);

  const visibleQueue = hideIrrelevant && !filter
    ? queue.filter((r) => r.status !== 'irrelevant')
    : queue;

  const projectOptions = projects.map((p) => (
    <option key={p.id} value={p.id}>
      {p.name}
    </option>
  ));

  async function setProject(rowId: string, projectId: string) {
    setLocalProject((m) => ({ ...m, [rowId]: projectId }));
    const reason = correctionReasons[rowId];
    await api.emails.triageReview(rowId, {
      action: 'set_project',
      resolved_project_id: projectId,
      ...(reason ? { correction_reason: reason } : {}),
    });
    await load();
  }

  async function approve(rowId: string) {
    const override = localProject[rowId];
    const reason = correctionReasons[rowId];
    await api.emails.triageReview(rowId, {
      action: 'approve',
      ...(override ? { resolved_project_id: override } : {}),
      ...(reason ? { correction_reason: reason } : {}),
    });
    await load();
  }

  async function rejectRow(rowId: string) {
    const reason = correctionReasons[rowId];
    await api.emails.triageReview(rowId, {
      action: 'reject',
      ...(reason ? { correction_reason: reason } : {}),
    });
    await load();
  }

  async function restoreFromIrrelevant(rowId: string) {
    await api.emails.triageReview(rowId, {
      action: 'set_project',
      resolved_project_id: projects[0]?.id || '',
      correction_reason: 'Visszaállítva irrelevánsból',
    });
    await load();
  }

  async function submitRule() {
    if (!ruleDraft?.pattern.trim() || !ruleDraft.project_id) return;
    await api.emails.triageRules.create({
      kind: ruleDraft.kind,
      pattern: ruleDraft.pattern.trim(),
      project_id: ruleDraft.project_id,
      name: `MC: ${ruleDraft.kind}`,
      created_from_triage_id: ruleDraft.triageId,
    });
    setRuleDraft(null);
    await load();
  }

  async function toggleRule(rule: TriageRoutingRule) {
    await api.emails.triageRules.patch(rule.id, { enabled: !rule.enabled });
    await load();
  }

  async function deleteRule(id: string) {
    if (!confirm('Törlöd a szabályt?')) return;
    await api.emails.triageRules.delete(id);
    await load();
  }

  function toggleBody(id: string) {
    setExpandedBody((m) => ({ ...m, [id]: !m[id] }));
  }

  function bestProject(row: EmailTriageQueueRow): string {
    return row.resolvedProject?.name
      ?? row.suggestedProject?.name
      ?? row.stage1Project?.name
      ?? '—';
  }

  const irrelevantCount = queue.filter((r) => r.status === 'irrelevant').length;
  const pendingCount = queue.filter((r) => r.status === 'pending_review').length;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-6 md:p-10">
      <div className="max-w-7xl mx-auto space-y-6">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              Email triage
            </h1>
            <p className="text-slate-400 text-sm mt-1">
              Kétlépcsős LLM osztályozás (Ollama + OpenAI) → felhasználói felülbírálat → tanuló szabályok
            </p>
          </div>
          <div className="flex items-center gap-3">
            {pendingCount > 0 && (
              <span className="px-3 py-1 rounded-full bg-amber-900/50 text-amber-200 text-sm font-medium">
                {pendingCount} ellenőrzésre vár
              </span>
            )}
            <button
              type="button"
              onClick={() => load()}
              className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-sm border border-slate-600"
            >
              Frissítés
            </button>
          </div>
        </header>

        {error && (
          <div className="rounded-lg border border-red-500/40 bg-red-950/40 px-4 py-3 text-red-200 text-sm">
            {error}
          </div>
        )}

        <div className="flex gap-2 border-b border-slate-800 pb-2">
          <button
            type="button"
            onClick={() => setTab('queue')}
            className={`px-4 py-2 rounded-t-lg text-sm font-medium ${
              tab === 'queue'
                ? 'bg-slate-800 text-white'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Sor ({visibleQueue.length})
          </button>
          <button
            type="button"
            onClick={() => setTab('rules')}
            className={`px-4 py-2 rounded-t-lg text-sm font-medium ${
              tab === 'rules'
                ? 'bg-slate-800 text-white'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Routing szabályok ({rules.length})
          </button>
        </div>

        {tab === 'queue' && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-3">
              <label className="text-sm text-slate-400">Státusz:</label>
              <select
                value={filter}
                onChange={(e) =>
                  setFilter(e.target.value as EmailTriageQueueStatus | '')
                }
                className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm"
              >
                <option value="">Mind</option>
                {(Object.keys(STATUS_LABELS) as EmailTriageQueueStatus[]).map(
                  (s) => (
                    <option key={s} value={s}>
                      {STATUS_LABELS[s]}
                    </option>
                  ),
                )}
              </select>

              {!filter && (
                <label className="flex items-center gap-2 text-sm text-slate-400 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={hideIrrelevant}
                    onChange={(e) => setHideIrrelevant(e.target.checked)}
                    className="rounded bg-slate-800 border-slate-600"
                  />
                  Irreleváns elrejtése ({irrelevantCount})
                </label>
              )}
            </div>

            {loading ? (
              <p className="text-slate-500">Betöltés…</p>
            ) : (
              <div className="space-y-3">
                {visibleQueue.length === 0 && (
                  <div className="rounded-xl border border-slate-800 px-6 py-12 text-center text-slate-500">
                    Nincs elem.{' '}
                    {!filter && hideIrrelevant && irrelevantCount > 0
                      ? `${irrelevantCount} irreleváns el van rejtve.`
                      : 'A Sophon imap.js triage parancsával tölti fel a sort.'}
                  </div>
                )}
                {visibleQueue.map((row) => {
                  const canAct =
                    row.status === 'fetched' ||
                    row.status === 'pending_review' ||
                    row.status === 'irrelevant';
                  const selectValue =
                    localProject[row.id] ??
                    row.resolvedProjectId ??
                    row.suggestedProjectId ??
                    row.stage1ProjectId ??
                    '';
                  const isExpanded = expandedBody[row.id];
                  const hasCorrection =
                    selectValue &&
                    selectValue !== row.suggestedProjectId &&
                    selectValue !== row.stage1ProjectId;

                  return (
                    <div
                      key={row.id}
                      className={`rounded-xl border border-slate-800 overflow-hidden ${
                        row.status === 'irrelevant' ? 'opacity-60' : ''
                      }`}
                    >
                      {/* Header row */}
                      <div className="flex flex-wrap items-start gap-3 px-4 py-3 bg-slate-900/50">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span
                              className={`inline-flex rounded-md px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[row.status]}`}
                            >
                              {STATUS_LABELS[row.status]}
                            </span>
                            <span className="text-xs text-slate-500">
                              {new Date(row.receivedAt).toLocaleString('hu-HU')}
                            </span>
                            {row.task && (
                              <Link
                                to={`/project/${row.resolvedProjectId || row.suggestedProjectId}`}
                                className="text-amber-400/90 text-xs hover:underline"
                              >
                                Task #{row.task.shortId}
                              </Link>
                            )}
                          </div>
                          <div className="text-sm font-medium text-slate-200 truncate">
                            {row.subject}
                          </div>
                          <div className="text-xs text-slate-400 mt-0.5">
                            <span className="font-mono">{row.fromEmail}</span>
                            {' → '}
                            <span className="font-mono">{row.toEmail}</span>
                          </div>
                        </div>

                        {/* Best project */}
                        <div className="text-right text-sm">
                          <div className="text-slate-400 text-xs mb-0.5">Projekt:</div>
                          <div className="text-slate-200 font-medium">{bestProject(row)}</div>
                        </div>
                      </div>

                      {/* LLM stages */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-px bg-slate-800">
                        {/* Stage 1 */}
                        <div className="bg-slate-950 px-4 py-2">
                          <div className="text-xs text-slate-500 mb-1 flex items-center gap-1.5">
                            <span className="inline-block w-1.5 h-1.5 rounded-full bg-blue-500" />
                            Stage 1 — {row.stage1Model || 'Ollama'}
                          </div>
                          {row.stage1Classification ? (
                            <>
                              <span className="text-xs font-medium text-blue-300">
                                {STAGE1_LABELS[row.stage1Classification] || row.stage1Classification}
                              </span>
                              {row.stage1Project && (
                                <span className="text-xs text-slate-400 ml-2">
                                  → {row.stage1Project.name}
                                </span>
                              )}
                              {row.stage1Rationale && (
                                <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">
                                  {row.stage1Rationale}
                                </p>
                              )}
                            </>
                          ) : (
                            <span className="text-xs text-slate-600">—</span>
                          )}
                        </div>

                        {/* Stage 2 */}
                        <div className="bg-slate-950 px-4 py-2">
                          <div className="text-xs text-slate-500 mb-1 flex items-center gap-1.5">
                            <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500" />
                            Stage 2 — {row.llmModel || 'OpenAI'}
                          </div>
                          {row.suggestedProject ? (
                            <>
                              <span className="text-xs font-medium text-emerald-300">
                                → {row.suggestedProject.name}
                              </span>
                              {row.llmRationale && (
                                <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">
                                  {row.llmRationale}
                                </p>
                              )}
                            </>
                          ) : row.llmRationale ? (
                            <p className="text-xs text-slate-500 line-clamp-2">
                              {row.llmRationale}
                            </p>
                          ) : (
                            <span className="text-xs text-slate-600">—</span>
                          )}
                        </div>
                      </div>

                      {/* Body preview toggle */}
                      {row.bodyText && (
                        <div className="border-t border-slate-800">
                          <button
                            type="button"
                            onClick={() => toggleBody(row.id)}
                            className="w-full px-4 py-1.5 text-xs text-slate-500 hover:text-slate-300 text-left"
                          >
                            {isExpanded ? '▼ Szöveg elrejtése' : '▶ Email szöveg megjelenítése…'}
                          </button>
                          {isExpanded && (
                            <div className="px-4 pb-3 text-xs text-slate-400 whitespace-pre-wrap max-h-60 overflow-y-auto font-mono leading-relaxed">
                              {row.bodyText.slice(0, 5000)}
                              {row.bodyText.length > 5000 && '\n\n… (csonkolva)'}
                            </div>
                          )}
                        </div>
                      )}

                      {/* Actions */}
                      {canAct && (
                        <div className="border-t border-slate-800 px-4 py-3 flex flex-wrap items-end gap-3 bg-slate-900/30">
                          <div className="flex-1 min-w-[200px]">
                            <label className="text-xs text-slate-500 block mb-1">
                              Projekt (felülírás):
                            </label>
                            <select
                              value={selectValue}
                              onChange={(e) => setProject(row.id, e.target.value)}
                              className="w-full max-w-[250px] bg-slate-900 border border-slate-700 rounded px-2 py-1.5 text-xs"
                            >
                              <option value="">— válassz —</option>
                              {projectOptions}
                            </select>
                          </div>

                          {hasCorrection && (
                            <div className="flex-1 min-w-[200px]">
                              <label className="text-xs text-slate-500 block mb-1">
                                Miért változtattad? (tanulás):
                              </label>
                              <input
                                type="text"
                                placeholder="pl. Ez a küldő mindig a Logframe projekthez tartozik"
                                value={correctionReasons[row.id] || ''}
                                onChange={(e) =>
                                  setCorrectionReasons((m) => ({
                                    ...m,
                                    [row.id]: e.target.value,
                                  }))
                                }
                                className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1.5 text-xs"
                              />
                            </div>
                          )}

                          <div className="flex gap-1.5">
                            {row.status === 'irrelevant' ? (
                              <button
                                type="button"
                                onClick={() => restoreFromIrrelevant(row.id)}
                                className="px-3 py-1.5 rounded bg-blue-800/60 hover:bg-blue-700/60 text-xs font-medium"
                              >
                                Visszaállít
                              </button>
                            ) : (
                              <>
                                <button
                                  type="button"
                                  onClick={() => approve(row.id)}
                                  className="px-3 py-1.5 rounded bg-emerald-700/80 hover:bg-emerald-600 text-xs font-medium"
                                >
                                  Jóváhagy
                                </button>
                                <button
                                  type="button"
                                  onClick={() => rejectRow(row.id)}
                                  className="px-3 py-1.5 rounded bg-slate-700 hover:bg-slate-600 text-xs"
                                >
                                  Elvet
                                </button>
                                <button
                                  type="button"
                                  onClick={() =>
                                    setRuleDraft({
                                      triageId: row.id,
                                      kind: 'sender_domain',
                                      pattern:
                                        row.fromEmail.split('@')[1] || '',
                                      project_id:
                                        selectValue ||
                                        row.suggestedProjectId ||
                                        row.stage1ProjectId ||
                                        '',
                                    })
                                  }
                                  className="px-3 py-1.5 rounded bg-amber-900/60 hover:bg-amber-800/60 text-xs"
                                >
                                  Szabály
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Existing correction reason */}
                      {row.correctionReason && (
                        <div className="border-t border-slate-800 px-4 py-2 bg-amber-950/20">
                          <span className="text-xs text-amber-400/80">
                            Korrekció indoklás: {row.correctionReason}
                          </span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {tab === 'rules' && (
          <div className="space-y-4">
            <p className="text-sm text-slate-400">
              A szabályok sorrendje: <strong>kisebb priority szám</strong> =
              előbb érvényesül. A felhasználói korrekciókból automatikusan is
              létrehozhatók szabályok a „Szabály" gombbal.
            </p>
            {loading ? (
              <p className="text-slate-500">Betöltés…</p>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-slate-800">
                <table className="w-full text-sm">
                  <thead className="bg-slate-900/80 text-slate-400 text-xs uppercase">
                    <tr>
                      <th className="px-3 py-3">Aktív</th>
                      <th className="px-3 py-3">Priority</th>
                      <th className="px-3 py-3">Típus</th>
                      <th className="px-3 py-3">Minta</th>
                      <th className="px-3 py-3">Projekt</th>
                      <th className="px-3 py-3" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {rules.length === 0 && (
                      <tr>
                        <td colSpan={6} className="px-3 py-8 text-center text-slate-500">
                          Nincs szabály. Használd a „Szabály" gombot egy triage sorból,
                          vagy hozz létre újat manuálisan.
                        </td>
                      </tr>
                    )}
                    {rules.map((r) => (
                      <tr key={r.id} className="hover:bg-slate-900/50">
                        <td className="px-3 py-2">
                          <button
                            type="button"
                            onClick={() => toggleRule(r)}
                            className={`text-xs px-2 py-1 rounded ${
                              r.enabled
                                ? 'bg-emerald-900/50 text-emerald-200'
                                : 'bg-slate-800 text-slate-500'
                            }`}
                          >
                            {r.enabled ? 'igen' : 'nem'}
                          </button>
                        </td>
                        <td className="px-3 py-2">{r.priority}</td>
                        <td className="px-3 py-2 font-mono text-xs">{r.kind}</td>
                        <td className="px-3 py-2 max-w-xs truncate" title={r.pattern}>
                          {r.pattern}
                        </td>
                        <td className="px-3 py-2">{r.project.name}</td>
                        <td className="px-3 py-2">
                          <button
                            type="button"
                            onClick={() => deleteRule(r.id)}
                            className="text-xs text-red-400 hover:underline"
                          >
                            Törlés
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {ruleDraft && (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50">
            <div className="bg-slate-900 border border-slate-700 rounded-xl p-6 max-w-md w-full space-y-4 shadow-xl">
              <h3 className="font-semibold">Új routing szabály</h3>
              <label className="block text-xs text-slate-400">Típus</label>
              <select
                value={ruleDraft.kind}
                onChange={(e) =>
                  setRuleDraft({ ...ruleDraft, kind: e.target.value })
                }
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm"
              >
                {RULE_KINDS.map((k) => (
                  <option key={k.value} value={k.value}>
                    {k.label}
                  </option>
                ))}
              </select>
              <label className="block text-xs text-slate-400">Minta</label>
              <input
                value={ruleDraft.pattern}
                onChange={(e) =>
                  setRuleDraft({ ...ruleDraft, pattern: e.target.value })
                }
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm font-mono"
              />
              <label className="block text-xs text-slate-400">Projekt</label>
              <select
                value={ruleDraft.project_id}
                onChange={(e) =>
                  setRuleDraft({ ...ruleDraft, project_id: e.target.value })
                }
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm"
              >
                <option value="">—</option>
                {projectOptions}
              </select>
              <div className="flex gap-2 justify-end pt-2">
                <button
                  type="button"
                  onClick={() => setRuleDraft(null)}
                  className="px-4 py-2 rounded-lg text-sm bg-slate-800"
                >
                  Mégse
                </button>
                <button
                  type="button"
                  onClick={() => submitRule()}
                  disabled={!ruleDraft.pattern.trim() || !ruleDraft.project_id}
                  className="px-4 py-2 rounded-lg text-sm bg-amber-600 disabled:opacity-40"
                >
                  Mentés
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
