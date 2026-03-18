#!/bin/bash
# OpenClaw + böngésző (noVNC) deploy
# Figyelem: Mac ARM-ről buildelt image nem fut x86_64 VPS-en. Ha exec format error: build a VPS-en (lásd DEPLOY_BROWSER.md).
set -e
REPO_DIR="$(cd "$(dirname "$0")/../../repo" && pwd)"
cd "$REPO_DIR"

echo "==> Building openclaw-with-browser..."
docker build --build-arg OPENCLAW_INSTALL_BROWSER=1 -t openclaw-with-browser .

echo "==> Building openclaw-sandbox-browser (noVNC viewer)..."
docker build -t openclaw-sandbox-browser:bookworm-slim -f Dockerfile.sandbox-browser .

echo "==> Saving images..."
docker save openclaw-with-browser | gzip > /tmp/openclaw-with-browser.tar.gz
docker save openclaw-sandbox-browser:bookworm-slim | gzip > /tmp/openclaw-sandbox-browser.tar.gz

echo "==> Copying to VPS..."
scp /tmp/openclaw-with-browser.tar.gz /tmp/openclaw-sandbox-browser.tar.gz root@23.88.58.202:/tmp/

echo "==> Loading and restarting on VPS..."
ssh root@23.88.58.202 'docker load < /tmp/openclaw-with-browser.tar.gz && docker load < /tmp/openclaw-sandbox-browser.tar.gz && rm /tmp/openclaw-with-browser.tar.gz /tmp/openclaw-sandbox-browser.tar.gz && docker stop $(docker ps -aq -f "label=openclaw.sandboxBrowser=1") 2>/dev/null; docker rm $(docker ps -aq -f "label=openclaw.sandboxBrowser=1") 2>/dev/null; (cd /root/taskmanager && ./start-openclaw-patch.sh) || bash /root/start-openclaw.sh'

echo ""
echo "Kész. Böngésző megtekintés (noVNC):"
echo "  1. ssh -L 16081:127.0.0.1:6080 root@23.88.58.202"
echo "  2. Böngészőben: http://localhost:16081/vnc_auto.html (jelszó: openclaw1)"
echo ""
echo "Részletes dokumentáció: taskmanager/DEPLOY_BROWSER.md"
