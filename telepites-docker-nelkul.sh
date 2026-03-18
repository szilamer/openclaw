#!/bin/bash
# OpenClaw Docker NÉLKÜL – Node.js-sel (nem kell image, nem kell hely a Dockernak)
# Futtasd: bash telepites-docker-nelkul.sh

set -e
echo "=== OpenClaw telepítése Docker nélkül ==="
echo ""

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js nincs telepítve. Töltsd le: https://nodejs.org (LTS), telepítsd, majd futtasd újra ezt a scriptet."
  exit 1
fi

echo "Node.js verzió: $(node -v)"
echo ""

echo "OpenClaw telepítése (npm)..."
npm install -g openclaw@latest
echo ""

echo "Onboarding indítása – a varázsló végigvezet a beállításon."
echo "Válaszd: helyi mód, token auth, majd add meg a modell (pl. Anthropic/OpenAI) beállításokat."
echo ""
openclaw onboard --install-daemon
