# Email – rétegek (OpenClaw cron vs opcionális API)

> **Fontos:** A **óránkénti / ütemezett** „nézd meg az emaileket” feladat a **OpenClaw cron** + **`jobs.json`** (Mac Mini). Ennek **szinte semmi köze** a Mission Control-hoz. Lásd **`docs/EMAIL_CRON_OPENCLAW.md`**.

Ez a lap a **opcionális** Mission Control integrációt és a repóbeli **`imap.js`** segédeszközt írja le — **nem** helyettesíti a fenti cron ellenőrzését.

## Szerepkörök

| Rész | Hol fut | Feladat |
|------|---------|---------|
| **OpenClaw email cron** | Mac Mini | `jobs.json` → agent turn → tipikusan `email_cron_atomic.sh` (a Macen, nem ebben a repóban) |
| **IMAP CLI (repó)** | Mac Mini workspace | `skills/imap-smtp-email/scripts/imap.js` — debug / alternatív pipeline; opcionális |
| **Mission Control API** | VPS (Docker) | **Csak ha** be akartok kötni: `POST /api/emails/intake`, `GET /api/emails/routing-map`; **új:** kétlépcsős triage — `docs/EMAIL_TRIAGE_MISSION_CONTROL.md`, UI: `/email-triage` |
| **Agent (Sophon)** | OpenClaw a Mac Minin | Cron üzenet szerinti script + döntés |

A Mission Control **nem** húzza le az IMAP-ot alapból; a postaláda a **OpenClaw oldalon** van.

## Telepítés (rövid)

1. Skill a workspace-ben: lásd `skills/imap-smtp-email/README.md` (`npm install`, `.env`).
2. **Jelszó** csak `.env`-ben – lásd `docs/CRON_BIZTONSAGI_JAVITAS.md`.
3. Agent token a Mission Controlban (seed vagy admin); ugyanaz megy a `TASKMANAGER_AGENT_TOKEN`-be.

## Tipikus folyamatok

### A) Csak „mi van a postaládában?”

```bash
cd ~/.openclaw/workspace
node skills/imap-smtp-email/scripts/imap.js check --limit 20
```

### B) Egy levél betöltése (JSON)

```bash
node skills/imap-smtp-email/scripts/imap.js fetch <UID>
```

### C) Egy levél azonnal Mission Controlba + task

```bash
node skills/imap-smtp-email/scripts/imap.js intake <UID> --mark-seen
```

`--no-task` = csak email rekord, task nélkül.

### D) Agent vezérelt (Több lépés)

1. `check` → UID lista  
2. Szűrés (noreply, newsletter – az agent logikája)  
3. `fetch` vagy közvetlen `intake` jóváhagyandó levelekre  
4. Szükség szerint `GET /api/emails/routing-map` a routing finomhangolásához  

## `source_uid`

Az `imap.js` egyedi kulcsot ad: `imap:<IMAP_USER>:<MAILBOX>:<UID>`. Ugyanazzal az üzenettel újra hívott `intake` **upsert** (nem duplikál) a backendben.

## Hibakeresés

- **Auth / IP**: az agent tokenhez tartozhat `allowedIps` – a Macről érkező kérés IP-jét engedélyezd, vagy fejlesztéshez `ALLOW_ALL_IPS=true` (csak kontrollált környezetben).
- **TLS**: önaláírt szerver → `IMAP_REJECT_UNAUTHORIZED=false` (már az `env.example`-ben így van).
