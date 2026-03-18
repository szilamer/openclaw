#!/usr/bin/env bash
# OpenClaw Docker – gyors indulás előre buildelt image-pel
# Futtasd: ./DOCKER_GYORS_INDITAS.sh

set -e
cd "$(dirname "$0")/repo"

echo "==> Image letöltése..."
docker compose pull openclaw-gateway 2>/dev/null || true

echo "==> Gateway indítása..."
docker compose up -d openclaw-gateway

echo ""
echo "✅ OpenClaw fut!"
echo ""
echo "   URL:      http://127.0.0.1:18789/"
echo "   Token:    6f523e3a539b14de6f5530f8af498400c70d28fcb3839982b86853e79931d4d1"
echo ""
echo "   A tokent illeszd be: Settings → token"
echo ""
echo "   Logok:    cd repo && docker compose logs -f openclaw-gateway"
echo "   Leállítás: cd repo && docker compose down"
echo ""
