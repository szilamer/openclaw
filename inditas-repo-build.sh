#!/bin/bash
# OpenClaw indítása a helyi repóból (heartbeat ok javítással)
# Kell: OPENAI_API_KEY környezeti változó (export OPENAI_API_KEY="sk-...")
# Futtasd: bash inditas-repo-build.sh

set -e
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_DIR="$SCRIPT_DIR/repo"
CONFIG_DIR="${HOME}/.openclaw"
CONFIG_FILE="$CONFIG_DIR/openclaw.json"
TOKEN="6f523e3a539b14de6f5530f8af498400c70d28fcb3839982b86853e79931d4d1"

# API kulcs: környezeti változó, vagy a meglévő configból
if [ -z "$OPENAI_API_KEY" ] && [ -f "$CONFIG_FILE" ]; then
  OPENAI_API_KEY=$(node -e "const fs=require('fs');const p=process.argv[1];try{const c=JSON.parse(fs.readFileSync(p,'utf8'));console.log(c.models?.providers?.openai?.apiKey||'')}catch(e){console.log('')}" "$CONFIG_FILE")
fi

if [ -z "$OPENAI_API_KEY" ]; then
  echo "HIBA: OPENAI_API_KEY nincs beállítva."
  echo "  export OPENAI_API_KEY=\"sk-...\""
  echo "  majd: bash inditas-repo-build.sh"
  exit 1
fi

echo "==> Régi konténer leállítása..."
docker stop openclaw 2>/dev/null || true
docker rm openclaw 2>/dev/null || true

echo "==> Image építése a repóból (ez eltarthat pár percig)..."
docker build -t openclaw-local "$REPO_DIR"

echo "==> Új konténer indítása (javított kóddal)..."
docker run -d --name openclaw --restart unless-stopped --init \
  -p 127.0.0.1:18789:18789 \
  -v "$CONFIG_DIR:/home/node/.openclaw" \
  -e HOME=/home/node \
  -e OPENCLAW_GATEWAY_TOKEN="$TOKEN" \
  -e OPENAI_API_KEY="$OPENAI_API_KEY" \
  openclaw-local node openclaw.mjs gateway --allow-unconfigured --bind lan --port 18789

echo ""
echo "Kész. Nyisd meg: http://127.0.0.1:18789/   Token: $TOKEN"
echo "A chatnek most már normálisan kell válaszolnia (nem csak heartbeat ok)."
