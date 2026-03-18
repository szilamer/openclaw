# TaskManager – OpenClaw integráció

Trello helyettesítő platform Sophon (OpenClaw) agent számára.

## Gyors indulás

### 1. Lokális fejlesztés

```bash
# PostgreSQL + backend
cd taskmanager
docker compose up -d postgres

# Migráció + seed
cd backend
cp env.example .env  # vagy hozd létre .env-t DATABASE_URL-lal
npm run prisma:migrate
npm run prisma:seed   # kiírja az agent tokent!

# Backend indítás
npm run start:dev
```

### 2. API végpontok

- `GET /api/health` – healthcheck (auth nélkül)
- `GET /api/projects` – projektek listája
- `POST /api/tasks` – feladat létrehozás
- `GET /api/tasks?project=...&status=...` – feladatok szűréssel
- `PATCH /api/tasks/:id` – feladat módosítás
- `POST /api/tasks/:id/move` – státusz váltás
- `POST /api/tasks/:id/comments` – komment
- `POST /api/emails/intake` – email ingest
- `GET /api/reports/daily?date=YYYY-MM-DD` – napi összefoglaló

Auth: `Authorization: Bearer <agent_token>`

### 3. taskmanager-api script (OpenClaw)

```bash
# Telepítés a VPS workspace-be
scp taskmanager/scripts/taskmanager-api root@23.88.58.202:/root/.openclaw/scripts/
ssh root@23.88.58.202 "chmod +x /root/.openclaw/scripts/taskmanager-api"

# Env a containerben (vagy a scriptben):
# TASKMANAGER_URL=http://taskmanager:3000/api
# TASKMANAGER_TOKEN=<seed-ből kapott token>
```

Használat:
```bash
taskmanager-api GET projects
taskmanager-api POST tasks '{"projectId":"...","title":"Új feladat"}'
taskmanager-api PATCH tasks/ID '{"status":"Kész"}'
```

### 4. Docker Compose (prod)

```bash
cd taskmanager
docker compose up -d
# Backend: http://localhost:3000
# API docs: http://localhost:3000/api/docs
```

## Struktúra

- `backend/` – NestJS API (Prisma, JWT-style agent token)
- `scripts/taskmanager-api` – OpenClaw exec script
- `docker-compose.yml` – PostgreSQL + backend

## Biztonság

- Agent token: Bearer, scope: tasks:read, tasks:write, projects:read, comments:write
- IP allowlist: 23.88.58.202 (VPS)
- Rate limit: 100 req/min
- Token tárolás: env vagy chmod 600 fájl, soha ne cron payload-ban
