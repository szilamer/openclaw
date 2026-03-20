#!/usr/bin/env bash
# GitHub Actions hívja SSH-n a VPS-en.
set -euxo pipefail
cd /root/taskmanager

echo "=== Ensure missioncontrol_net exists ==="
docker network create missioncontrol_net 2>/dev/null || true

echo "=== Ensure Postgres is running ==="
if ! docker ps --format '{{.Names}}' | grep -q taskmanager_postgres; then
  docker start taskmanager_postgres 2>/dev/null || \
  docker run -d --name taskmanager_postgres --restart unless-stopped \
    --network missioncontrol_net \
    -e POSTGRES_USER=taskmanager -e POSTGRES_PASSWORD=taskmanager -e POSTGRES_DB=taskmanager \
    -p 5433:5432 \
    -v taskmanager_pgdata:/var/lib/postgresql/data \
    postgres:16-alpine
fi
docker network connect missioncontrol_net taskmanager_postgres 2>/dev/null || true
for i in $(seq 1 15); do
  docker exec taskmanager_postgres pg_isready -U taskmanager -d taskmanager >/dev/null 2>&1 && break
  echo "waiting postgres $i/15..."; sleep 2
done

echo "=== Build backend image ==="
docker build -q -t taskmanager_backend:latest ./backend

echo "=== Build frontend image ==="
docker build -q -t taskmanager_frontend:latest ./frontend

echo "=== Restart frontend ==="
docker stop taskmanager_frontend_1 2>/dev/null || true
docker rm taskmanager_frontend_1 2>/dev/null || true
docker run -d \
  --name taskmanager_frontend_1 \
  --restart unless-stopped \
  --network missioncontrol_net \
  -p 8080:80 \
  taskmanager_frontend:latest

echo "=== Restart backend ==="
bash /root/taskmanager/scripts/start-taskmanager-backend.sh

echo "=== Wait for backend ==="
sleep 5

echo "=== Prisma migrate ==="
docker exec taskmanager_backend_1 npx prisma migrate deploy 2>&1 || echo "No pending migrations"

echo "=== Health checks ==="
for i in $(seq 1 10); do
  if curl -sf http://127.0.0.1:3000/api/health >/dev/null 2>&1; then
    echo "Backend OK"
    break
  fi
  echo "waiting backend $i/10..."
  sleep 3
done

curl -sf http://127.0.0.1:3000/api/health || { echo "BACKEND FAILED"; exit 1; }

FE_CODE=$(curl -sf -o /dev/null -w "%{http_code}" http://127.0.0.1:8080/ 2>&1 || echo "000")
echo "Frontend HTTP: $FE_CODE"
[ "$FE_CODE" = "200" ] || { echo "FRONTEND FAILED"; exit 1; }

echo "=== Deploy complete ==="
