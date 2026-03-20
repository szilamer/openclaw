# IMAP skill – Node CLI (check / fetch / opcionális intake)

**Nem ugyanaz**, mint az **OpenClaw `jobs.json` email cron** (`email_cron_atomic.sh` stb.). A ütemezett postaláda-nézés a **`~/.openclaw/cron/jobs.json`**-ből indul — lásd **`docs/EMAIL_CRON_OPENCLAW.md`**.

Ez a mappa egy **verziózott segédeszköz**: IMAP lista / letöltés, és **ha kéritek**, HTTP POST a Mission Control felé.

A skill a **Mac Mini** OpenClaw workspace-ben él: másold be (vagy rsynceld) a repó `skills/imap-smtp-email/` mappáját ide:

`~/.openclaw/workspace/skills/imap-smtp-email/`

## Telepítés

```bash
cd ~/.openclaw/workspace/skills/imap-smtp-email
cp env.example .env
# szerkeszd .env – IMAP_* és opcionálisan TASKMANAGER_*
chmod 600 .env
npm install
```

## Parancsok

```bash
# Olvasatlanak jelölt levelek (max 20)
node scripts/imap.js check --limit 20

# Egy levél teljes szövege JSON-ban (agent / curl)
node scripts/imap.js fetch 12345

# Ugyanaz + POST /api/emails/intake (Bearer agent token)
node scripts/imap.js intake 12345 --mark-seen
```

Az `intake` a `TASKMANAGER_BASE_URL` + `TASKMANAGER_AGENT_TOKEN` mezőket használja (lásd `env.example`).

## OpenClaw cron / üzenet

Ne tedd az IMAP jelszót a `jobs.json` üzenet szövegébe – csak `.env`. Példa utasítás az agentnek:

```text
cd ~/.openclaw/workspace && node skills/imap-smtp-email/scripts/imap.js check --limit 20
```

Részletek: `docs/CRON_BIZTONSAGI_JAVITAS.md`, `docs/EMAIL_WORKFLOW.md`.

## Mission Control API

- `POST /api/emails/intake` – mezők: `from`, `to`, `subject`, `date` (ISO string), `body`, `source_uid`, opcionálisan `auto_create_task`, `projectId`.
- `GET /api/emails/routing-map` – projekt / kulcsszó routing (agentnek).
