#!/bin/bash
# TaskManager backend indítása – backend alias szükséges az agent számára
# Használat: ./scripts/start-taskmanager-backend.sh

set -e

docker rm -f taskmanager_backend_1 2>/dev/null || true

docker run -d \
  --name taskmanager_backend_1 \
  --restart unless-stopped \
  --network missioncontrol_net \
  --network-alias backend \
  -p 3000:3000 \
  -v /root/openclaw-mirror:/data/openclaw:ro \
  -v /root/taskmanager:/data/taskmanager:ro \
  -e DATABASE_URL=postgresql://taskmanager:taskmanager@postgres:5432/taskmanager \
  -e PORT=3000 \
  -e ALLOW_ALL_IPS=true \
  -e KB_ROOTS="/data/openclaw:OpenClaw,/data/taskmanager:TaskManager" \
  -e OPENCLAW_DATA_PATH="/data/openclaw" \
  taskmanager_backend:latest

echo "Backend started with alias 'backend' – agent can resolve taskmanager-api"
