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
  fetched: 'Letöltve (nincs LLM)',
  pending_review: 'Ellenőrzésre vár',
  approved: 'Jóváhagyva',
  rejected: 'Elvetve',
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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<'queue' | 'rules'>('queue');

  const [localProject, setLocalProject] = useState<Record<string, string>>({});
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

  const projectOptions = projects.map((p) => (
    <option key={p.id} value={p.id}>
      {p.name}
    </option>
  ));

  async function setProject(rowId: string, projectId: string) {
    setLocalProject((m) => ({ ...m, [rowId]: projectId }));
    await api.emails.triageReview(rowId, {
      action: 'set_project',
      resolved_project_id: projectId,
    });
    await load();
  }

  async function approve(rowId: string) {
    const override = localProject[rowId];
    await api.emails.triageReview(rowId, {
      action: 'approve',
      ...(override ? { resolved_project_id: override } : {}),
    });
    await load();
  }

  async function rejectRow(rowId: string) {
    await api.emails.triageReview(rowId, { action: 'reject' });
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

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-6 md:p-10">
      <div className="max-w-7xl mx-auto space-y-6">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              Email triage
            </h1>
            <p className="text-slate-400 text-sm mt-1">
              LLM javaslat javítása, jóváhagyás, routing szabályok — Mission
              Control
            </p>
          </div>
          <button
            type="button"
            onClick={() => load()}
            className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-sm border border-slate-600"
          >
            Frissítés
          </button>
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
            Sor (email)
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
            </div>

            {loading ? (
              <p className="text-slate-500">Betöltés…</p>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-slate-800">
                <table className="w-full text-sm text-left">
                  <thead className="bg-slate-900/80 text-slate-400 uppercase text-xs">
                    <tr>
                      <th className="px-3 py-3">Dátum</th>
                      <th className="px-3 py-3">Státusz</th>
                      <th className="px-3 py-3">Feladó</th>
                      <th className="px-3 py-3">Tárgy</th>
                      <th className="px-3 py-3">LLM javaslat</th>
                      <th className="px-3 py-3">Projekt (javítás)</th>
                      <th className="px-3 py-3">Művelet</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {queue.length === 0 && (
                      <tr>
                        <td
                          colSpan={7}
                          className="px-3 py-8 text-center text-slate-500"
                        >
                          Nincs sor. A Sophon script{' '}
                          <code className="text-amber-400/90">
                            POST /api/emails/triage/register
                          </code>{' '}
                          hívásával tölti fel.
                        </td>
                      </tr>
                    )}
                    {queue.map((row) => {
                      const canAct =
                        row.status === 'fetched' ||
                        row.status === 'pending_review';
                      const selectValue =
                        localProject[row.id] ??
                        row.resolvedProjectId ??
                        row.suggestedProjectId ??
                        '';
                      return (
                        <tr key={row.id} className="hover:bg-slate-900/50">
                          <td className="px-3 py-2 whitespace-nowrap text-slate-400">
                            {new Date(row.receivedAt).toLocaleString('hu-HU')}
                          </td>
                          <td className="px-3 py-2">
                            <span className="inline-flex rounded-md bg-slate-800 px-2 py-0.5 text-xs">
                              {STATUS_LABELS[row.status]}
                            </span>
                            {row.task &&
                              (row.resolvedProjectId || row.suggestedProjectId) && (
                              <Link
                                to={`/project/${row.resolvedProjectId || row.suggestedProjectId}`}
                                className="block text-amber-400/90 text-xs mt-1 hover:underline"
                              >
                                Task #{row.task.shortId}
                              </Link>
                            )}
                          </td>
                          <td className="px-3 py-2 max-w-[140px] truncate text-slate-300" title={row.fromEmail}>
                            {row.fromEmail}
                          </td>
                          <td className="px-3 py-2 max-w-[200px]">
                            <span className="line-clamp-2" title={row.subject}>
                              {row.subject}
                            </span>
                            {row.llmRationale && (
                              <p
                                className="text-xs text-slate-500 mt-1 line-clamp-2"
                                title={row.llmRationale}
                              >
                                {row.llmRationale}
                              </p>
                            )}
                          </td>
                          <td className="px-3 py-2 text-slate-300">
                            {row.suggestedProject?.name ?? '—'}
                          </td>
                          <td className="px-3 py-2">
                            {canAct ? (
                              <select
                                value={selectValue}
                                onChange={(e) =>
                                  setProject(row.id, e.target.value)
                                }
                                className="w-full max-w-[180px] bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs"
                              >
                                <option value="">— válassz —</option>
                                {projectOptions}
                              </select>
                            ) : (
                              <span>
                                {row.resolvedProject?.name ??
                                  row.suggestedProject?.name ??
                                  '—'}
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-2 whitespace-nowrap space-x-1">
                            {canAct && (
                              <>
                                <button
                                  type="button"
                                  onClick={() => approve(row.id)}
                                  className="px-2 py-1 rounded bg-emerald-700/80 hover:bg-emerald-600 text-xs"
                                >
                                  Jóváhagy
                                </button>
                                <button
                                  type="button"
                                  onClick={() => rejectRow(row.id)}
                                  className="px-2 py-1 rounded bg-slate-700 hover:bg-slate-600 text-xs"
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
                                        '',
                                    })
                                  }
                                  className="px-2 py-1 rounded bg-amber-900/60 hover:bg-amber-800/60 text-xs"
                                >
                                  Szabály
                                </button>
                              </>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {tab === 'rules' && (
          <div className="space-y-4">
            <p className="text-sm text-slate-400">
              A szabályok sorrendje: <strong>kisebb priority szám</strong> =
              előbb érvényesül (ugyanúgy, mint az{' '}
              <code className="text-amber-400/90">POST /api/emails/intake</code>{' '}
              routingnál).
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
