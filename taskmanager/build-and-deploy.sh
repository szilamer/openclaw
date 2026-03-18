#!/bin/bash
# Lokálisan buildel + production node_modules, majd feltölti - NINCS npm a VPS-en
set -e
VPS="${1:-23.88.58.202}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "=== Lokális build ==="
cd "$SCRIPT_DIR/backend"
npm run build
npm prune --production

echo "=== Feltöltés VPS-re (node_modules-szal) ==="
rsync -avz --exclude .env \
  "$SCRIPT_DIR/" "root@$VPS:/root/taskmanager/"

echo "=== Docker build (prebuilt - nincs npm) ==="
ssh "root@$VPS" 'cp /root/taskmanager/backend/Dockerfile.prebuilt /root/taskmanager/backend/Dockerfile'
ssh "root@$VPS" 'cd /root/taskmanager && docker-compose build backend 2>&1'

echo "=== Indítás ==="
ssh "root@$VPS" 'cd /root/taskmanager && docker-compose up -d'

echo "=== Migráció ==="
sleep 5
ssh "root@$VPS" 'cd /root/taskmanager && docker-compose exec -T backend npx prisma migrate deploy 2>/dev/null || true'

echo "=== Kész. Token: docker-compose exec backend npx ts-node scripts/generate-agent-token.ts ==="
