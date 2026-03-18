#!/bin/bash
# TaskManager deploy a Hetzner VPS-re
# Használat: ./deploy-to-vps.sh [VPS_IP]
# Előfeltétel: ssh root@VPS_IP működik

set -e
VPS="${1:-23.88.58.202}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "=== TaskManager deploy → $VPS ==="

# 1. Feltöltés
echo "Feltöltés..."
rsync -avz --exclude node_modules --exclude .env --exclude dist \
  "$SCRIPT_DIR/" "root@$VPS:/root/taskmanager/" 2>/dev/null || {
  echo "rsync nem elérhető, használd scp-t vagy git clone-t"
  echo "scp -r $SCRIPT_DIR root@$VPS:/root/"
  exit 1
}

# 2. .env (ha nincs)
echo "Env ellenőrzés..."
ssh "root@$VPS" "test -f /root/taskmanager/backend/.env || echo 'DATABASE_URL=\"postgresql://taskmanager:taskmanager@postgres:5432/taskmanager\"' > /root/taskmanager/backend/.env"

# 3. Docker Compose
echo "Docker Compose..."
ssh "root@$VPS" "cd /root/taskmanager && docker-compose up -d --build"

# 4. Migráció (várjuk meg a backend indulását)
echo "Migráció..."
sleep 8
ssh "root@$VPS" "cd /root/taskmanager && docker-compose exec -T backend npx prisma migrate deploy 2>/dev/null || true"

# 5. taskmanager-api script
echo "taskmanager-api script..."
scp "$SCRIPT_DIR/scripts/taskmanager-api" "root@$VPS:/root/.openclaw/scripts/"
ssh "root@$VPS" "chmod +x /root/.openclaw/scripts/taskmanager-api"

# 6. Docker network aliases (service hostname resolution)
echo "Network aliases..."
ssh "root@$VPS" "
  docker network disconnect taskmanager_default c7e29cbd2be1_taskmanager_postgres_1 2>/dev/null
  docker network connect --alias postgres taskmanager_default c7e29cbd2be1_taskmanager_postgres_1 2>/dev/null || true
  docker network disconnect taskmanager_default taskmanager_backend_1 2>/dev/null
  docker network connect --alias backend taskmanager_default taskmanager_backend_1 2>/dev/null || true
"

echo ""
echo "=== Kész ==="
echo "Token generálás: ssh root@$VPS 'cd /root/taskmanager && docker-compose exec backend npx ts-node scripts/generate-agent-token.ts'"
echo "Health check: curl http://$VPS:3000/api/health"
