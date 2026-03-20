#!/usr/bin/env bash
# GitHub Actions hívja SSH-n: /root/taskmanager/scripts/ci-deploy-remote.sh
# (Ne futtasd helyi gépen — VPS /root/taskmanager könyvtárban értelmezett.)
set -euxo pipefail
cd /root/taskmanager

docker rm -f taskmanager_frontend_1 2>/dev/null || true

echo "=== Build & up (missioncontrol_net) ==="
docker compose build backend frontend
docker compose up -d --force-recreate

echo "=== Wait for Postgres ==="
PG_OK=0
for i in $(seq 1 30); do
  if docker compose exec -T postgres pg_isready -U taskmanager -d taskmanager >/dev/null 2>&1; then
    echo "Postgres ready ($i)"
    PG_OK=1
    break
  fi
  echo "waiting postgres $i/30..."
  sleep 2
done
if [ "$PG_OK" != "1" ]; then
  echo "Postgres never became ready"
  docker compose logs postgres --tail 50 || true
  exit 1
fi

sleep 5

echo "=== Migrations ==="
docker compose exec -T backend npx prisma migrate deploy

echo "=== Health backend ==="
BE_OK=0
for i in $(seq 1 20); do
  if curl -sf http://127.0.0.1:3000/api/health >/dev/null 2>&1; then
    echo "Backend OK ($i)"
    BE_OK=1
    break
  fi
  echo "waiting backend $i/20..."
  sleep 3
done
if [ "$BE_OK" != "1" ]; then
  echo "Backend health failed"
  docker compose logs backend --tail 100 || true
  exit 1
fi

echo "=== Health frontend ==="
if curl -sf -o /dev/null http://127.0.0.1:8080/; then
  echo "Frontend OK"
else
  echo "Frontend check failed"
  docker compose logs frontend --tail 60 || true
  exit 1
fi

docker image prune -f >/dev/null 2>&1 || true
echo "=== Deploy complete ==="
