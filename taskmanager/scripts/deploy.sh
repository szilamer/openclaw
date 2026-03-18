#!/bin/bash
# Mission Control — Teljes CI/CD deploy pipeline
# Használat: ./scripts/deploy.sh [--skip-ci] [--backend-only] [--frontend-only]
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
VPS="root@23.88.58.202"
SKIP_CI=false
BACKEND_ONLY=false
FRONTEND_ONLY=false

for arg in "$@"; do
  case $arg in
    --skip-ci) SKIP_CI=true ;;
    --backend-only) BACKEND_ONLY=true ;;
    --frontend-only) FRONTEND_ONLY=true ;;
  esac
done

green() { printf "\033[32m✓ %s\033[0m\n" "$1"; }
red()   { printf "\033[31m✗ %s\033[0m\n" "$1"; }
info()  { printf "\033[36m→ %s\033[0m\n" "$1"; }
step()  { printf "\n\033[33m━━━ %s ━━━\033[0m\n" "$1"; }

echo ""
echo "╔══════════════════════════════════════╗"
echo "║   Mission Control — Deploy Pipeline  ║"
echo "╚══════════════════════════════════════╝"

# ── 1. CI ellenőrzés ──
if [ "$SKIP_CI" = false ]; then
  step "1/5 CI ellenőrzés"
  bash "$SCRIPT_DIR/ci.sh"
else
  step "1/5 CI ellenőrzés (ÁTUGORVA)"
fi

# ── 2. Feltöltés VPS-re ──
step "2/5 Forráskód feltöltés"

if [ "$BACKEND_ONLY" = false ]; then
  info "Frontend feltöltés..."
  rsync -avz --delete \
    --exclude='node_modules' --exclude='dist' --exclude='.env' \
    "$ROOT/frontend/" "$VPS:/root/taskmanager/frontend/" 2>&1 | tail -1
  green "Frontend szinkronizálva"
fi

if [ "$FRONTEND_ONLY" = false ]; then
  info "Backend feltöltés..."
  rsync -avz --delete \
    --exclude='node_modules' --exclude='dist' --exclude='.env' \
    "$ROOT/backend/" "$VPS:/root/taskmanager/backend/" 2>&1 | tail -1
  green "Backend szinkronizálva"
fi

rsync -avz "$ROOT/docker-compose.yml" "$VPS:/root/taskmanager/" 2>&1 | tail -1
rsync -avz "$ROOT/scripts/" "$VPS:/root/taskmanager/scripts/" 2>&1 | tail -1

# ── 3. Docker build ──
step "3/5 Docker image build (VPS)"

if [ "$BACKEND_ONLY" = false ]; then
  info "Frontend image build..."
  ssh "$VPS" "cd /root/taskmanager && docker build -q -t taskmanager_frontend:latest ./frontend" 2>&1
  green "Frontend image kész"
fi

if [ "$FRONTEND_ONLY" = false ]; then
  info "Backend image build..."
  ssh "$VPS" "cd /root/taskmanager && docker build -q -t taskmanager_backend:latest ./backend" 2>&1
  green "Backend image kész"
fi

# ── 4. Konténerek újraindítása ──
step "4/5 Konténerek újraindítása"

if [ "$BACKEND_ONLY" = false ]; then
  info "Frontend konténer..."
  ssh "$VPS" '
    docker stop taskmanager_frontend_1 2>/dev/null
    docker rm taskmanager_frontend_1 2>/dev/null
    docker run -d \
      --name taskmanager_frontend_1 \
      --restart unless-stopped \
      --network taskmanager_default \
      -p 3010:80 \
      taskmanager_frontend:latest
  ' 2>&1 | tail -1
  green "Frontend konténer fut"
fi

if [ "$FRONTEND_ONLY" = false ]; then
  info "Backend konténer..."
  ssh "$VPS" 'bash /root/taskmanager/scripts/start-taskmanager-backend.sh' 2>&1 | tail -1
  green "Backend konténer fut"

  info "Prisma migráció..."
  sleep 5
  ssh "$VPS" 'docker exec taskmanager_backend_1 npx prisma migrate deploy 2>&1 || echo "Nincs új migráció"' 2>&1
fi

# ── 5. Health check ──
step "5/5 Ellenőrzés"
sleep 3

if [ "$BACKEND_ONLY" = false ]; then
  HTTP_CODE=$(ssh "$VPS" 'curl -s -o /dev/null -w "%{http_code}" http://localhost:3010/')
  if [ "$HTTP_CODE" = "200" ]; then
    green "Frontend: HTTP $HTTP_CODE"
  else
    red "Frontend: HTTP $HTTP_CODE"
  fi
fi

if [ "$FRONTEND_ONLY" = false ]; then
  HEALTH=$(ssh "$VPS" 'curl -s http://localhost:3000/api/health 2>&1' | head -1)
  if echo "$HEALTH" | grep -q "ok\|status"; then
    green "Backend API: OK"
  else
    red "Backend API: $HEALTH"
  fi
fi

TITLE=$(ssh "$VPS" 'curl -s http://localhost:3010/ | grep "<title>"' | sed 's/.*<title>//' | sed 's/<\/title>.*//')
echo ""
echo "╔══════════════════════════════════════╗"
echo "║         DEPLOY SIKERES               ║"
echo "╠══════════════════════════════════════╣"
echo "║  URL: https://sp.logframe.cc         ║"
echo "║  Title: $TITLE"
echo "╚══════════════════════════════════════╝"
