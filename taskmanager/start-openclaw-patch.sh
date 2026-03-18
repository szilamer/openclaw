#!/bin/bash
# OpenClaw container indítása / újraindítása
# Frissítve: 2026-02-26
# Megjegyzés: trello-api + taskmanager-api perzisztens mount

set -e

echo 'Stopping and removing old container (if exists)...'
docker stop openclaw 2>/dev/null || true
docker rm openclaw 2>/dev/null || true

DOCKER_GID=$(stat -c '%g' /var/run/docker.sock 2>/dev/null || echo "999")
echo "Starting OpenClaw container (docker GID=${DOCKER_GID})..."
docker run -d \
  --name openclaw \
  --restart unless-stopped \
  --group-add "${DOCKER_GID}" \
  --network taskmanager_default \
  -p 127.0.0.1:18789:18789 \
  -p 127.0.0.1:6080:6080 \
  -v /root/.openclaw:/home/node/.openclaw \
  -v /var/run/docker.sock:/var/run/docker.sock \
  -v /usr/bin/docker:/usr/bin/docker \
  -v /root/.openclaw/scripts/trello-api:/usr/local/bin/trello-api \
  -v /root/.openclaw/scripts/taskmanager-api:/usr/local/bin/taskmanager-api \
  -e OPENAI_API_KEY="${OPENAI_API_KEY:-}" \
  -e NODE_ENV=production \
  -e OPENCLAW_PREFER_PNPM=1 \
  -e OPENCLAW_BROWSER_HEADLESS=0 \
  -e OPENCLAW_BROWSER_ENABLE_NOVNC=1 \
  -e OPENCLAW_BROWSER_NOVNC_PASSWORD="${OPENCLAW_NOVNC_PASSWORD:-openclaw1}" \
  -e TASKMANAGER_URL=http://backend:3000/api \
  -e TASKMANAGER_TOKEN="${TASKMANAGER_TOKEN:-}" \
  -e OPENCLAW_GATEWAY_PORT=18789 \
  openclaw-with-browser

echo 'Waiting for startup...'
sleep 5
docker ps | grep openclaw && echo 'OpenClaw is running!'
