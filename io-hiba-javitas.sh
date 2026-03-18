#!/bin/bash
# Docker I/O hiba javítása – futtasd: bash io-hiba-javitas.sh

set -e
TOKEN="6f523e3a539b14de6f5530f8af498400c70d28fcb3839982b86853e79931d4d1"
CONFIG_DIR="$HOME/.openclaw"
IMAGE="ghcr.io/openclaw/openclaw:main"
CONTAINER_NAME="openclaw"

echo "=== 1. Szabad hely a lemezen ==="
df -h / | tail -1
echo ""

echo "=== 2. Docker cache és felesleges adatok törlése (hely felszabadítása) ==="
docker system prune -af --volumes 2>/dev/null || true
echo ""

echo "=== 3. Újra próbálom az image letöltését ==="
docker pull "$IMAGE"
echo ""

echo "=== 4. Régi openclaw konténer eltávolítása ==="
docker stop openclaw 2>/dev/null || true
docker rm openclaw 2>/dev/null || true
echo ""

echo "=== 5. Config és indítás ==="
mkdir -p "$CONFIG_DIR/workspace"
[ -f "$CONFIG_DIR/openclaw.json" ] || cat > "$CONFIG_DIR/openclaw.json" << 'JSON'
{"gateway":{"mode":"local","bind":"loopback","port":18789,"auth":{"mode":"token","token":"6f523e3a539b14de6f5530f8af498400c70d28fcb3839982b86853e79931d4d1"},"agents":{"defaults":{"workspace":"/home/node/.openclaw/workspace"}}}
JSON

docker run -d --name openclaw --restart unless-stopped --init \
  -p 127.0.0.1:18789:18789 \
  -v "$CONFIG_DIR:/home/node/.openclaw" \
  -e HOME=/home/node -e OPENCLAW_GATEWAY_TOKEN="$TOKEN" \
  "$IMAGE" node openclaw.mjs gateway --allow-unconfigured --bind lan --port 18789

sleep 2
if docker ps | grep -q openclaw; then
  echo ""
  echo "Kész. Nyisd meg: http://127.0.0.1:18789/   Token: $TOKEN"
else
  echo "Konténer nem fut. Log:"
  docker logs openclaw 2>&1 | tail -25
  exit 1
fi
