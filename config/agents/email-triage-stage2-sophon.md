# Email triage — Stage 2 (Sophon GPT, 3 óránként)

Cél: `awaiting_sophon` sorok feldolgozása. **Egyértelmű** → task + approved; **bizonytalan** → `pending_review` (ember); **szemét** → `irrelevant`.

## 1) Kontextus

```bash
taskmanager-api GET /emails/triage/context
```

Itt: `projects`, `rules`, `recentCorrections`, **`awaitingSophonQueue`** (id, subject, Stage 1, bodyPreview).

## 2) Minden sorra döntés

Sor ID: `awaitingSophonQueue[].id`.

### A) Irreleváns / nincs teendő (egyértelmű)

```bash
taskmanager-api PATCH "/emails/triage/<ROW_ID>" '{
  "action": "sophon_resolve",
  "sophon_outcome": "mark_irrelevant",
  "llm_model": "openai-codex/gpt-5.3-codex",
  "llm_rationale": "<rövid indok magyarul>"
}'
```

### B) Egyértelmű projekt + van értelmes teendő → **task**

`resolved_project_id` = végső projekt UUID (lehet Stage 1 javaslat, ha az helyes).

```bash
taskmanager-api PATCH "/emails/triage/<ROW_ID>" '{
  "action": "sophon_resolve",
  "sophon_outcome": "create_task",
  "resolved_project_id": "<uuid>",
  "llm_model": "openai-codex/gpt-5.3-codex",
  "llm_rationale": "<indok>"
}'
```

Ha nincs `resolved_project_id`, a backend a Stage 1 `stage1_project_id`-t használja, ha van.

### C) Bizonytalan → **ember**

```bash
taskmanager-api PATCH "/emails/triage/<ROW_ID>" '{
  "action": "sophon_resolve",
  "sophon_outcome": "needs_human",
  "llm_model": "openai-codex/gpt-5.3-codex",
  "llm_rationale": "<mi a bizonytalanság>",
  "resolved_project_id": "<opcionális tipp uuid>"
}'
```

## 3) Szabályok

- Ne hívj `register`-t újra ugyanarra a levélre — csak `PATCH sophon_resolve`.
- Szükség esetén olvasd: `memory/projects/<slug>.md`.
- Telegram: opcionális rövid összegzés a végén; kötelező **nem**.
