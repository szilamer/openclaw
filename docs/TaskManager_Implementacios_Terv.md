# TaskManager – Implementációs terv

> Részletes végrehajtási terv a TaskManager MVP és OpenClaw integrációhoz.
> Alap: TaskManager_Integracio_Terv.md, TaskManager_Implementacio_Valaszok.md

---

## Fázisok áttekintése

| Fázis | Tartalom | Becsült idő |
|-------|----------|-------------|
| **0** | Biztonsági javítások (azonnali) | 0.5 h |
| **1** | TaskManager projekt scaffold | 1 h |
| **2** | DB séma + Prisma | 1 h |
| **3** | Auth + service token | 1.5 h |
| **4** | Tasks/Projects CRUD API | 2 h |
| **5** | Email ingest + reports | 1 h |
| **6** | taskmanager-api script | 0.5 h |
| **7** | Docker Compose + health | 1 h |

---

## Fázis 0: Biztonsági javítások

### 0.1 SZERVER-KONFIG-NAPLO.md
- Trello KEY és TOKEN eltávolítása (sor 109–111, 377)
- Placeholder: `$TRELLO_KEY`, `$TRELLO_TOKEN` — értékek csak `secrets.md` (VPS)

### 0.2 Cron jobs – IMAP credential
- A `jobs.json`-ban lévő `IMAP_PASS='...'` eltávolítása a payload message-ből
- Alternatíva: `skills/imap-smtp-email/.env` — a script dotenv-val tölti
- Cron message: "Run node skills/imap-smtp-email/scripts/imap.js check --limit 20" (env a .env-ből)

### 0.3 Cron jobs – .env deployment
- `skills/imap-smtp-email/.env.example` létrehozása
- Dokumentáció: hogyan deploy-olni a .env-t a VPS-re (scp, chmod 600, chown 1000:1000)

---

## Fázis 1: TaskManager projekt scaffold

### 1.1 Könyvtárstruktúra
```
taskmanager/
├── backend/          # NestJS API
├── frontend/         # Next.js (MVP: minimal)
├── docker-compose.yml
├── .env.example
└── README.md
```

### 1.2 Backend (NestJS)
- `nest new backend`
- Prisma, @nestjs/jwt, class-validator, @nestjs/throttler
- Modulok: AuthModule, ProjectsModule, TasksModule, EmailsModule, ReportsModule

### 1.3 Frontend (Next.js) – MVP minimal
- Csak API teszteléshez; kanban UI később
- Vagy: egyszerű login + task lista

---

## Fázis 2: DB séma + Prisma

### 2.1 Táblák
- users, projects, project_members
- tasks, task_status_history, task_comments, task_labels, task_label_links
- email_messages, email_task_links
- agent_tokens, agent_actions

### 2.2 Task státuszok
Beérkező, Teendő, Folyamatban, Várakozás, Felülvizsgálat, Kész

### 2.3 Seed
- sophon-agent user
- Default labels (🤖 Sophon, 👤 Szilamér, ⏳ Várakozás, 📧 Email)
- 1 teszt projekt

---

## Fázis 3: Auth + service token

### 3.1 JWT auth
- POST /auth/login (email, password)
- POST /auth/refresh
- Guard: JwtAuthGuard

### 3.2 Service token (agent)
- agent_tokens tábla: token_hash, user_id, scopes, allowed_ips
- Middleware: Bearer token ellenőrzés, scope check, IP allowlist (23.88.58.202)
- Rate limit: 100 req/min

### 3.3 Seed: sophon-agent token
- API token generálás
- Scope: tasks:read, tasks:write, projects:read, comments:write

---

## Fázis 4: Tasks/Projects CRUD API

### 4.1 Projects
- GET /projects
- POST /projects
- PATCH /projects/:id
- GET /projects/:id/tasks

### 4.2 Tasks
- GET /tasks (filters: project, status, due_before, assignee, label)
- POST /tasks
- GET /tasks/:id
- PATCH /tasks/:id
- POST /tasks/:id/move (status change)
- POST /tasks/:id/comments

### 4.3 OpenAPI
- Swagger/OpenAPI 3.0
- @nestjs/swagger

---

## Fázis 5: Email ingest + reports

### 5.1 POST /emails/intake
- Body: from, to, subject, date, body, attachments, source_uid
- Optional: auto_classify
- Creates email_messages, optional tasks, email_task_links

### 5.2 GET /reports/daily
- Query: date=YYYY-MM-DD
- Returns: summary JSON (lejárt, ma lejáró, blokkolt, stb.)

### 5.3 GET /health
- Simple 200 OK

---

## Fázis 6: taskmanager-api script

### 6.1 Script helye
- `/root/.openclaw/scripts/taskmanager-api` (host)
- Bind mount: `/usr/local/bin/taskmanager-api` (container)

### 6.2 Szintaxis
```
taskmanager-api GET /tasks?project=X
taskmanager-api POST /tasks '{"title":"...","projectId":"..."}'
taskmanager-api PATCH /tasks/ID '{"status":"Kész"}'
```

### 6.3 Credentials
- TASKMANAGER_URL, TASKMANAGER_TOKEN env vars
- Vagy: script belsejében (chmod 600) — mint trello-api

---

## Fázis 7: Docker Compose + health

### 7.1 docker-compose.taskmanager.yml
- backend (NestJS)
- postgres
- redis (opcionális MVP-ben)
- frontend (opcionális)

### 7.2 start-taskmanager.sh
- docker compose up -d
- Volume: postgres data
- Env: DATABASE_URL, JWT_SECRET, AGENT_TOKEN

---

## Végrehajtási sorrend

1. Fázis 0 (biztonság)
2. Fázis 1 (scaffold)
3. Fázis 2 (Prisma)
4. Fázis 3 (auth)
5. Fázis 4 (CRUD)
6. Fázis 5 (email, reports)
7. Fázis 6 (script)
8. Fázis 7 (Docker)

---

---

## Végrehajtás állapota (2026-02-26)

| Fázis | Státusz |
|-------|---------|
| 0. Biztonsági javítások | ✅ Kész |
| 1. Projekt scaffold | ✅ Kész |
| 2. DB séma + Prisma | ✅ Kész |
| 3. Auth + service token | ✅ Kész |
| 4. Tasks/Projects CRUD | ✅ Kész |
| 5. Email ingest + reports | ✅ Kész |
| 6. taskmanager-api script | ✅ Kész |
| 7. Docker Compose | ✅ Kész |

**Következő lépések:**
1. `docker compose up -d postgres` → backend indítás
2. `prisma migrate deploy` + `prisma db seed` → token generálás
3. taskmanager-api script deploy a VPS-re
4. Cron jobok átállítása taskmanager-api-ra (ha kész)

*Utoljára frissítve: 2026-02-26*
