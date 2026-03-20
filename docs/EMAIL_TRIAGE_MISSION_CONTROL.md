# Email triage — kétlépcsős LLM pipeline

## Folyamat

```
IMAP (Mac Mini)
  → Stage 1: Ollama (llama3.2:3b) — gyors osztályozás
  → Stage 2: Sophon/OpenAI — KB + korrekciók kontextusával review
  → Mission Control: regisztráció
  → Felhasználó: jóváhagyás/felülírás + indoklás (tanulás)
  → Task létrehozás (jóváhagyáskor)
```

### Stage 1 — Ollama (helyi LLM)

A `imap.js triage` parancs minden UNSEEN emailre:
1. Letölti a teljes email szöveget IMAP-on
2. Ollama-nak küldi osztályozásra (`http://localhost:11434/api/generate`)
3. Eredmény: `irrelevant` | `relevant_unknown` | `classified` + indoklás + projekt ID

### Stage 2 — Sophon (OpenAI)

A Sophon agent (cron job) áttekinti az összes emailt a nagyobb kontextusablakával:
- Projekt KB fájlok (`memory/projects/*.md`)
- Aktív routing szabályok (`GET /api/emails/triage-rules`)
- Korábbi felhasználói korrekciók + indoklásuk (`GET /api/emails/triage/context`)

Megerősíti vagy felülírja a Stage 1 besorolást.

### Mission Control UI

A felhasználó (`/email-triage`) látja:
- Mindkét LLM döntését (Stage 1 + Stage 2 oszlop)
- Email szöveget (kinyitható)
- Projektbesorolást (felülírható dropdown)
- **Korrekció indoklás** mező — „Miért változtattad?" → ez kerül be a jövőbeli Stage 2 promptba
- Szabály létrehozás gomb (determinisztikus routing a jövőre)

## API

| Módszer | Útvonal | Leírás |
|---------|---------|--------|
| `POST` | `/api/emails/triage/register` | Sor felvétele (mindkét stage eredményével) |
| `GET` | `/api/emails/triage/queue?status=pending_review` | Lista (max 500) |
| `PATCH` | `/api/emails/triage/:id` | Review: `approve` / `reject` / `set_project` + `correction_reason` |
| `GET` | `/api/emails/triage/context` | Projektek + KB + szabályok + korrekciók (Sophon prompthoz) |
| `GET` | `/api/emails/triage/rules` | Szabályok (MC UI) |
| `POST` | `/api/emails/triage/rules` | Új szabály |
| `PATCH` | `/api/emails/triage/rules/:id` | Szabály módosítás |
| `DELETE` | `/api/emails/triage/rules/:id` | Szabály törlés |
| `GET` | `/api/emails/triage-rules` | Lapos szabálylista (Sophon scriptnek) |

### `POST /api/emails/triage/register` body

```json
{
  "source_uid": "imap:user:INBOX:12345",
  "mailbox": "inbox",
  "from": "Partner <x@y.hu>",
  "to": "info@logframe.cc",
  "subject": "Projekt ajánlat",
  "date": "2026-03-20T10:00:00Z",
  "body": "Teljes email szöveg...",
  "stage1_classification": "classified",
  "stage1_model": "llama3.2:3b",
  "stage1_rationale": "Küldő domain egyezik a projekttel",
  "stage1_project_id": "uuid-or-null",
  "suggested_project_id": "uuid-or-null",
  "llm_model": "gpt-5.3-codex",
  "llm_rationale": "A KB alapján ez a Logframe projekthez tartozik"
}
```

### `PATCH /api/emails/triage/:id` body

```json
{
  "action": "approve",
  "resolved_project_id": "uuid",
  "correction_reason": "Ez a küldő mindig a Logframe projekthez tartozik, nem az adminhoz"
}
```

## Státuszok

| Státusz | Jelentés |
|---------|----------|
| `fetched` | Email letöltve, nincs LLM osztályozás |
| `irrelevant` | Mindkét LLM irrelevánsnak ítélte |
| `pending_review` | LLM besorolta, felhasználói ellenőrzésre vár |
| `approved` | Jóváhagyva → Task + EmailMessage létrehozva |
| `rejected` | Elvetve (nem kell task) |

## Adatbázis

### `email_triage_queue` mezők

| Mező | Típus | Leírás |
|------|-------|--------|
| `stage1_classification` | text | Stage 1: irrelevant / relevant_unknown / classified |
| `stage1_model` | text | Stage 1 modell neve (pl. llama3.2:3b) |
| `stage1_rationale` | text | Stage 1 indoklás |
| `stage1_project_id` | uuid FK | Stage 1 projekt javaslat |
| `llm_model` | text | Stage 2 modell neve (pl. gpt-5.3-codex) |
| `llm_rationale` | text | Stage 2 indoklás |
| `suggested_project_id` | uuid FK | Stage 2 projekt javaslat |
| `resolved_project_id` | uuid FK | Felhasználó végső döntése |
| `correction_reason` | text | Felhasználó indoklása a korrekcióhoz |

### `triage_routing_rules`

Determinisztikus szabályok: `sender_email`, `sender_domain`, `subject_contains`, `body_contains`, `regex_subject`. Kisebb priority szám = előbb érvényesül.

## Tanulási hurok

1. Felhasználó felülírja a besorolást + rögzíti az indoklást
2. Opcionálisan routing szabályt hoz létre (determinisztikus)
3. A `GET /api/emails/triage/context` visszaadja az utolsó 30 korrekciót
4. Sophon Stage 2 promptja tartalmazza ezeket → jobb döntések a jövőben

## imap.js parancsok

```bash
node imap.js triage [--limit N]           # UNSEEN emailek + Ollama Stage 1
node imap.js mark-seen <uid1> [uid2 ...]  # \Seen flag beállítása
node imap.js check [--limit N]            # UNSEEN UID-k listája (nem triage)
node imap.js fetch <uid>                  # Teljes levél JSON
node imap.js intake <uid> [opts]          # Legacy: közvetlen task létrehozás
```

### Env változók (skills/imap-smtp-email/.env)

```
OLLAMA_URL=http://localhost:11434
OLLAMA_MODEL=llama3.2:3b
TASKMANAGER_BASE_URL=https://sp.logframe.cc/api
TASKMANAGER_AGENT_TOKEN=...
```
