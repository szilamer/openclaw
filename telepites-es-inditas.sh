#!/bin/bash
# OpenClaw telepítés és indítás – egy scripttel
# Futtasd a Mac Termináljában: bash telepites-es-inditas.sh
# (A projekt mappájából: cd /Users/feherszilamer/Projects/OpenClaw majd ./telepites-es-inditas.sh)

set -e
OPENCLAW_DIR="${OPENCLAW_DIR:-$HOME/Projects/OpenClaw}"
CONFIG_DIR="$HOME/.openclaw"
TOKEN="6f523e3a539b14de6f5530f8af498400c70d28fcb3839982b86853e79931d4d1"
IMAGE="ghcr.io/openclaw/openclaw:main"
CONTAINER_NAME="openclaw"

echo "=========================================="
echo "  OpenClaw – telepítés és indítás"
echo "=========================================="
echo ""

# 1. Docker fut?
echo "[1/5] Docker ellenőrzése..."
if ! docker info >/dev/null 2>&1; then
  echo "    HIBA: A Docker nem fut."
  echo "    Indítsd el a Docker Desktopot, várj amíg 'Engine running', majd futtasd újra:"
  echo "    ./telepites-es-inditas.sh"
  exit 1
fi
echo "    OK"
echo ""

# 2. Config és workspace
echo "[2/5] Config és workspace előkészítése..."
mkdir -p "$CONFIG_DIR/workspace"
if [ ! -f "$CONFIG_DIR/openclaw.json" ]; then
  cat > "$CONFIG_DIR/openclaw.json" << 'JSON'
{
  "gateway": {
    "mode": "local",
    "bind": "loopback",
    "port": 18789,
    "auth": { "mode": "token", "token": "6f523e3a539b14de6f5530f8af498400c70d28fcb3839982b86853e79931d4d1" }
  },
  "agents": { "defaults": { "workspace": "/home/node/.openclaw/workspace" } }
}
JSON
  echo "    openclaw.json létrehozva."
else
  echo "    openclaw.json már létezik."
fi
echo "    OK"
echo ""

# 3. Régi konténer leállítása (ha van)
echo "[3/5] Régi konténer eltávolítása (ha volt)..."
docker stop "$CONTAINER_NAME" 2>/dev/null || true
docker rm "$CONTAINER_NAME" 2>/dev/null || true
echo "    OK"
echo ""

# 4. Image letöltése
echo "[4/5] OpenClaw image letöltése (~4 GB, ez 2–5 perc lehet)..."
docker pull "$IMAGE"
echo "    OK"
echo ""

# 5. Konténer indítása
echo "[5/5] Gateway indítása..."
docker run -d \
  --name "$CONTAINER_NAME" \
  --restart unless-stopped \
  --init \
  -p 127.0.0.1:18789:18789 \
  -v "$CONFIG_DIR:/home/node/.openclaw" \
  -e HOME=/home/node \
  -e OPENCLAW_GATEWAY_TOKEN="$TOKEN" \
  "$IMAGE" \
  node openclaw.mjs gateway --allow-unconfigured --bind lan --port 18789

echo "    Konténer elindítva."
echo ""

# Ellenőrzés
sleep 2
if docker ps --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
  echo "=========================================="
  echo "  Kész. OpenClaw fut."
  echo "=========================================="
  echo ""
  echo "  Böngészőben nyisd meg:  http://127.0.0.1:18789/"
  echo "  Token (Settings → token):  $TOKEN"
  echo ""
  echo "  Leállítás:  docker stop openclaw"
  echo "  Újraindítás:  docker start openclaw"
  echo ""
else
  echo "FIGYELEM: A konténer nem fut. Log:"
  docker logs "$CONTAINER_NAME" 2>&1 | tail -30
  exit 1
fi
