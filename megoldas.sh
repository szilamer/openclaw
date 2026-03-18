#!/bin/bash
# Egy script – futtasd: bash megoldas.sh
# (Dupla kattintás nem elég; Terminal-ban: cd /Users/feherszilamer/Projects/OpenClaw majd bash megoldas.sh)

set -e
TOKEN="6f523e3a539b14de6f5530f8af498400c70d28fcb3839982b86853e79931d4d1"
CONFIG_DIR="$HOME/.openclaw"
IMAGE="ghcr.io/openclaw/openclaw:main"
CONTAINER_NAME="openclaw"

echo "Docker leállítása..."
pkill -9 Docker 2>/dev/null || true
pkill -9 "Docker Desktop" 2>/dev/null || true
pkill -9 com.docker.backend 2>/dev/null || true
pkill -9 com.docker.hyperkit 2>/dev/null || true
pkill -9 com.docker.vmnetd 2>/dev/null || true
sleep 5

echo "Docker Desktop indítása..."
open -a "Docker Desktop" 2>/dev/null || open -a "Docker" 2>/dev/null
echo "Várok 90 másodpercet, amíg a Docker feláll..."
sleep 90

echo "Docker ellenőrzése..."
if ! docker info >/dev/null 2>&1; then
  echo "A Docker még nem válaszol. Futtasd újra: bash megoldas.sh"
  exit 1
fi

mkdir -p "$CONFIG_DIR/workspace"
[ -f "$CONFIG_DIR/openclaw.json" ] || cat > "$CONFIG_DIR/openclaw.json" << 'JSON'
{"gateway":{"mode":"local","bind":"loopback","port":18789,"auth":{"mode":"token","token":"6f523e3a539b14de6f5530f8af498400c70d28fcb3839982b86853e79931d4d1"},"agents":{"defaults":{"workspace":"/home/node/.openclaw/workspace"}}}
JSON

docker stop openclaw 2>/dev/null || true
docker rm openclaw 2>/dev/null || true

echo "Image letöltése..."
docker pull "$IMAGE"

echo "OpenClaw indítása..."
docker run -d --name openclaw --restart unless-stopped --init \
  -p 127.0.0.1:18789:18789 \
  -v "$CONFIG_DIR:/home/node/.openclaw" \
  -e HOME=/home/node -e OPENCLAW_GATEWAY_TOKEN="$TOKEN" \
  "$IMAGE" node openclaw.mjs gateway --allow-unconfigured --bind lan --port 18789

sleep 3
docker ps | grep openclaw && echo "" && echo "Kész. Nyisd meg: http://127.0.0.1:18789/  Token: $TOKEN" || (echo "Hiba:"; docker logs openclaw 2>&1 | tail -20)
