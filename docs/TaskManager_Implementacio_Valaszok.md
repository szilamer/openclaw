# TaskManager integráció – implementációs válaszok

> A korábban feltett kérdésekre adott válaszok a **jelen projekt környezet** (OpenClaw Hetzner VPS, Trello, email workflow) és az **OpenClaw logok** alapján, kiemelt biztonsági szempontokkal.
>
> Források: SZERVER-KONFIG-NAPLO.md, TOOLS.md, AGENTS.md, cron jobs.json, OpenClaw logok, TELEPITES_MAGAS_BIZTONSAG.md

---

## 1. Stack és architektúra

| Kérdés | Válasz a jelen helyzet alapján |
|--------|-------------------------------|
| **Backend: NestJS vs FastAPI** | **NestJS** – a tervben szerepel, TypeScript egységesebb az OpenClaw/Node.js környezettel. A `trello-api` és az `imap-smtp-email` skill is Node.js, így könnyebb integráció. |
| **Auth: Keycloak vs JWT** | **Beépített JWT + refresh** – MVP-hez elég, Keycloak felesleges overhead. A jelenlegi Trello API key+token mintát követve egyszerű service token kell az agentnek. |
| **Objektumtár** | **Hetzner Object Storage** – ugyanazon a provideren van a VPS, egyszerűbb számlázás és hálózat. MinIO csak ha lokális/dev kell. |
| **Observability MVP-ben** | **App logs + egyszerű healthcheck** – a Prometheus/Grafana/Loki később. A jelenlegi OpenClaw `docker logs` + `GET /health` elég az MVP-hez. |

---

## 2. API és szerződések

| Kérdés | Válasz |
|--------|--------|
| **OpenAPI spec** | **Készüljön először** – a `trello-api` script URL-paraméter hibája (dupla `?`) miatt fontos a pontos spec. OpenAPI 3.0 draft → codegen → validáció. |
| **Service token formátum** | **Bearer token** (pl. `Authorization: Bearer tm_agent_xxx`) – egyszerű, szabványos. Scope: `tasks:read`, `tasks:write`, `projects:read`, `comments:write`. |
| **Rate limit** | **100 req/min per agent token** – a Trello limit (300/10s) jó referencia. Az agent cron 2 óránként fut, ez bőven elég. |
| **Idempotency key** | **Header: `X-Idempotency-Key: <uuid>`** – a `POST /agent/actions`-nél kötelező. A cron job `id` + `lastRunAtMs` kombinációja jó alap. |

---

## 3. Adatbázis és migráció

| Kérdés | Válasz |
|--------|--------|
| **PostgreSQL verzió** | **16** – Hetzner managed DB vagy Docker image. |
| **Migration tool** | **Prisma** – NestJS-hez jól illeszkedik, típusbiztos. |
| **Audit trail** | `task_status_history`: `task_id`, `from_status`, `to_status`, `changed_by`, `changed_at`. `agent_actions`: `id`, `task_id`, `action_type`, `payload_hash`, `idempotency_key`, `created_at`. |
| **Soft delete** | **`deleted_at`** – a Trello `closed=true` mintáját követve. Fizikai törlés ne legyen. |

---

## 4. OpenClaw integráció

| Kérdés | Válasz a jelen helyzet alapján |
|--------|-------------------------------|
| **TaskManager URL** | **Ugyanazon VPS-en** – `taskmanager.sophon29.hu` vagy `taskmanager.logframe.cc` (ha van domain). A `23.88.58.202` fix IP mellett belső `http://taskmanager:3000` is működhet Docker Compose-ban. |
| **Agent service account** | **Seed/migration** – a `sophon-agent` user + API token a DB seed-ben legyen. Ne legyen UI-ból hozható (biztonsági kockázat). |
| **Credentials tárolás** | **secrets.md + taskmanager-api script** – a jelenlegi `trello-api` mintát követve: `/root/.openclaw/scripts/taskmanager-api` bind mount, credentials a scriptben vagy env-ből. **FONTOS:** Ne legyen a cron payload-ban (lásd 9. szekció). |
| **Browser fallback** | **Csak API down** – ha `GET /health` 5xx vagy timeout, akkor fallback. A logok szerint a böngésző (`device identity required`, `connect failed`) problémás, ezért az API-first megközelítés helyes. |

---

## 5. Email workflow

| Kérdés | Válasz a jelen helyzet alapján |
|--------|-------------------------------|
| **POST /emails/intake – ki hívja?** | **OpenClaw agent** – a jelenlegi flow: agent futtatja `node skills/imap-smtp-email/scripts/imap.js check`, feldolgozza, és **a TaskManager `POST /emails/intake`** endpointját hívja az új emailekkel. A TaskManager nem húzza le az IMAP-ot – az OpenClaw marad az IMAP gateway. |
| **Auto-classification MVP-ben** | **Nem** – a jelenlegi robot szűrő (noreply, newsletter stb.) marad az agent oldalán. A TaskManager csak tárolja a `source_type: email` és `source_ref` (UID) mezőket. |
| **Email–task kapcsolat** | **1 email → N task** – egy levélből több feladat is keletkezhet (pl. válasz + teendő). Az `email_task_links` tábla ezt támogatja. |

---

## 6. Trello migráció

| Kérdés | Válasz |
|--------|--------|
| **Átmeneti időszak** | **2–4 hét** – a cron jobok párhuzamosan futnak (Trello + TaskManager), migráció után a cron payload-ot cseréljük. |
| **Label mapping** | **Fix mapping tábla** – a SZERVER-KONFIG-NAPLO.md-ben szereplő labelek: 🤖 Sophon feladata, 👤 Szilamér, ⏳ Várakozás, 📧 Email válasz. Ezek → TaskManager `task_labels` seed. |
| **Kommentek import** | **Igen** – Trello `GET /cards/{id}/actions` → `task_comments` import. Dátum és author megőrzése (ha elérhető). |

---

## 7. DevOps és deployment

| Kérdés | Válasz a jelen helyzet alapján |
|--------|-------------------------------|
| **Docker Compose** | **Külön compose** – `docker-compose.taskmanager.yml` az OpenClaw mellett. A `/root/start-openclaw.sh` mintájára készüljön `start-taskmanager.sh`. |
| **Reverse proxy** | **Caddy** – egyszerűbb konfig, automatikus Let's Encrypt. A jelenlegi OpenClaw `localhost:18789`-en fut; a TaskManager külön porton (pl. 3000) + Caddy route. |
| **TLS** | **Let's Encrypt** – domain kell (pl. `taskmanager.logframe.cc`). A `logframe.cc` már használatban van (sophon@logframe.cc). |
| **Backup** | **Napi pg_dump** → Hetzner Object Storage vagy lokális `/root/.openclaw/backups/`. A TELEPITES_MAGAS_BIZTONSAG.md `chmod 700` elveit követve. |

---

## 8. MVP prioritások (2–3 hét)

| Prioritás | Funkció | Indoklás |
|-----------|---------|----------|
| **P1** | REST API + service token | Az agent cron azonnal használja. |
| **P2** | Project + task CRUD, státusz (kanban) | A Trello helyettesítéséhez elengedhetetlen. |
| **P3** | `POST /emails/intake` | Az email cron átállításához kell. |
| **P4** | Login + kommentek | Szilamér napi használatához. |
| **P5** | Napi összefoglaló endpoint | A reggeli cron (`30 10 * * *`) már kér adatot – JSON formátum, `GET /reports/daily?date=YYYY-MM-DD`. |

**Kanban UI:** MVP-ben elég a státusz tábla nézet, drag-and-drop később.

---

## 9. Biztonság – KRITIKUS

### 9.1 Jelenlegi biztonsági problémák (korrigálandók)

A projekt áttekintése során a következő problémák merültek fel:

| Probléma | Hol | Javasolt megoldás |
|----------|-----|-------------------|
| **Trello API Key + Token plain text** | SZERVER-KONFIG-NAPLO.md (sor 109–111, 377) | Távolítsd el a dokumentumból. Használj placeholder-t: `$TRELLO_KEY`, `$TRELLO_TOKEN`. A tényleges értékek csak `secrets.md`-ben (VPS) legyenek. |
| **IMAP jelszó a cron payload-ban** | jobs.json – `IMAP_PASS='Sophon123!*'` | **Soha ne** legyen credential a cron message-ben. Használj env file-t vagy a TaskManager `POST /emails/intake`-ot, ahol az OpenClaw már hitelesítve van. Az IMAP credential a skill `.env`-ben legyen (chmod 600), és az agent olvassa env-ből. |
| **trello-api hardcoded credentials** | `/root/.openclaw/scripts/trello-api` | Elfogadható, ha a fájl chmod 600 és csak root/node olvassa. Jobb: env változók a containerben, pl. `TRELLO_KEY`, `TRELLO_TOKEN` a `docker run -e`-vel. |
| **secrets.md workspace-ben** | Agent minden turnnél kapja | A bootstrapTotalMaxChars limit miatt lehet hogy nem kerül be, de a gitignore ellenére a fájl a workspace-ben van. A TaskManager token **ne** kerüljön a secrets.md-be – külön `taskmanager.env` vagy a scriptben (bind mount, chmod 600). |

### 9.2 TaskManager-specifikus biztonsági követelmények

| Követelmény | Implementáció |
|-------------|---------------|
| **IP allowlist** | Agent token scope: csak `23.88.58.202` (VPS fix IP). A TaskManager API middleware ellenőrizze a `X-Forwarded-For` vagy `X-Real-IP` headert. |
| **Audit log** | Append-only fájl vagy külön `audit_log` tábla. Ne legyen törölhető. A `agent_actions` tábla erre is jó. |
| **Titokkezelés MVP** | `.env` elfogadható, de: `chmod 600`, ne legyen a git-ben, ne legyen a workspace bootstrap-ban. A TaskManager `.env` a containerben legyen, ne a host workspace-ben. |
| **Rate limit** | 100 req/min per token. 429 válasz + `Retry-After` header. |
| **HTTPS** | Kötelező prod-ban. Caddy + Let's Encrypt. |

### 9.3 OpenClaw logokból levont tanulságok

- **`[tools] write failed: EACCES`** – a `skills/imap-smtp-email/.env`-t az agent nem tudja írni (jogosultság). A TaskManager integrációnál: a token soha ne kerüljön olyan helyre, ahová az agent írhat.
- **`elevated is not available`** – a Telegram cron-nál az elevated tool tiltva. A TaskManager API hívás `exec` + `curl`/`node` scripttel történjen, nem elevated-del.
- **`Unknown model: openai-codex/gpt-4o-mini`** – a cron jobok `model` mezője ellenőrizendő. A TaskManager cron payload-ban használd a működő modellt (pl. `gpt-4o-mini`).

---

## 10. Cron és agent feladatok

| Kérdés | Válasz |
|--------|--------|
| **Mikor váltanak át?** | Ha a TaskManager MVP kész: (1) `POST /emails/intake` működik, (2) `GET /tasks`, `PATCH /tasks/{id}` működik, (3) a napi összefoglaló endpoint kész. Ekkor a cron payload-ot módosítjuk: `trello-api` → `taskmanager-api` (vagy `curl`). |
| **Új script: taskmanager-api** | **Igen** – a `trello-api` mintájára: `taskmanager-api GET /tasks?project=X`, `taskmanager-api POST /tasks '{"title":"..."}'`. A credentials env-ből vagy a scriptből (chmod 600). Bind mount: `/root/.openclaw/scripts/taskmanager-api` → `/usr/local/bin/taskmanager-api`. |

---

## 11. Összefoglaló – következő lépések

1. **Biztonsági javítások azonnal:** SZERVER-KONFIG-NAPLO.md-ből Trello credentials eltávolítása; cron payload-ból IMAP jelszó kivétele.
2. **API contract:** OpenAPI draft (auth, tasks, projects, emails/intake).
3. **DB séma + migration:** Prisma, PostgreSQL 16.
4. **TaskManager MVP:** NestJS + Next.js + Docker Compose.
5. **taskmanager-api script:** A trello-api mintájára, env-based credentials.
6. **Integrációs teszt:** `POST /tasks`, `PATCH /tasks/{id}` az OpenClaw containerből.

---

*Dokumentum létrehozva: 2026-02-26. Forrás: TaskManager_Integracio_Terv.md, projekt környezet, OpenClaw logok.*
