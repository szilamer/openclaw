#!/bin/bash
# Pairing kikapcsolva – újraindítás, majd nyisd meg: http://127.0.0.1:18789/

CONFIG_DIR="$HOME/.openclaw"
TOKEN="6f523e3a539b14de6f5530f8af498400c70d28fcb3839982b86853e79931d4d1"
IMAGE="ghcr.io/openclaw/openclaw:main"

# Config frissítése: device pairing kikapcsolva (csak helyi használatra)
mkdir -p "$CONFIG_DIR"
cat > "$CONFIG_DIR/openclaw.json" << 'JSON'
{
  "gateway": {
    "mode": "local",
    "bind": "loopback",
    "port": 18789,
    "auth": { "mode": "token", "token": "6f523e3a539b14de6f5530f8af498400c70d28fcb3839982b86853e79931d4d1" },
    "controlUi": { "dangerouslyDisableDeviceAuth": true }
  },
  "agents": { "defaults": { "workspace": "/home/node/.openclaw/workspace" } }
}
JSON

echo "Konténer újraindítása..."
docker stop openclaw 2>/dev/null || true
docker rm openclaw 2>/dev/null || true

docker run -d --name openclaw --restart unless-stopped --init \
  -p 127.0.0.1:18789:18789 \
  -v "$CONFIG_DIR:/home/node/.openclaw" \
  -e HOME=/home/node -e OPENCLAW_GATEWAY_TOKEN="$TOKEN" \
  "$IMAGE" node openclaw.mjs gateway --allow-unconfigured --bind lan --port 18789

sleep 3
echo ""
echo "Kész. Nyisd meg: http://127.0.0.1:18789/"
echo "Token: $TOKEN"
echo "A 'pairing required' most már nem fog megjelenni."
