#!/bin/bash
# Ha a konténer fut de az URL-en nincs semmi – újraindítás helyes paranccsal
# Futtasd: bash url-javitas.sh

TOKEN="6f523e3a539b14de6f5530f8af498400c70d28fcb3839982b86853e79931d4d1"
CONFIG_DIR="$HOME/.openclaw"
IMAGE="ghcr.io/openclaw/openclaw:main"

docker stop openclaw 2>/dev/null || true
docker rm openclaw 2>/dev/null || true

docker run -d --name openclaw --restart unless-stopped --init \
  -p 127.0.0.1:18789:18789 \
  -v "$CONFIG_DIR:/home/node/.openclaw" \
  -e HOME=/home/node -e OPENCLAW_GATEWAY_TOKEN="$TOKEN" \
  "$IMAGE" node openclaw.mjs gateway --allow-unconfigured --bind lan --port 18789

echo "Várok 5 mp-et..."
sleep 5
echo ""
echo "Konténer állapot:"
docker ps -a | grep openclaw
echo ""
echo "Utolsó log sorok:"
docker logs openclaw 2>&1 | tail -15
echo ""
if docker ps | grep -q openclaw; then
  echo "Nyisd meg: http://127.0.0.1:18789/   Token: $TOKEN"
else
  echo "A konténer leállt. A log fentebb látható."
fi
