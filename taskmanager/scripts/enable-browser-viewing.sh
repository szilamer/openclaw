#!/bin/bash
# Böngésző megtekintése noVNC-n keresztül – futtasd VPS-en
# Előfeltétel: sandbox browser image (openclaw-sandbox-browser:bookworm-slim)
set -e

CONFIG="/root/.openclaw/openclaw.json"

echo "==> Böngésző megtekintés engedélyezése (headed + noVNC)..."

python3 << PYEOF
import json
with open("${CONFIG}") as f:
    cfg = json.load(f)

# Sandbox browser struktúra
if "agents" not in cfg:
    cfg["agents"] = {}
if "defaults" not in cfg["agents"]:
    cfg["agents"]["defaults"] = {}
if "sandbox" not in cfg["agents"]["defaults"]:
    cfg["agents"]["defaults"]["sandbox"] = {}
if "browser" not in cfg["agents"]["defaults"]["sandbox"]:
    cfg["agents"]["defaults"]["sandbox"]["browser"] = {}

cfg["agents"]["defaults"]["sandbox"]["browser"]["enabled"] = True
cfg["agents"]["defaults"]["sandbox"]["browser"]["headless"] = False
cfg["agents"]["defaults"]["sandbox"]["browser"]["enableNoVnc"] = True

# Browser tool engedélyezése
if "tools" not in cfg:
    cfg["tools"] = {}
if "sandbox" not in cfg["tools"]:
    cfg["tools"]["sandbox"] = {}
if "tools" not in cfg["tools"]["sandbox"]:
    cfg["tools"]["sandbox"]["tools"] = {}
cfg["tools"]["sandbox"]["tools"]["deny"] = [
    "canvas", "nodes", "cron", "gateway",
    "telegram", "whatsapp", "discord", "irc", "googlechat", "slack", "signal", "imessage"
]

with open("${CONFIG}", "w") as f:
    json.dump(cfg, f, indent=2)
print("OK: headless=false, enableNoVnc=true")
PYEOF

echo "==> Régi sandbox browser konténerek eltávolítása (új config miatt)..."
docker stop $(docker ps -aq -f "label=openclaw.sandboxBrowser=1") 2>/dev/null || true
docker rm $(docker ps -aq -f "label=openclaw.sandboxBrowser=1") 2>/dev/null || true

echo "==> OpenClaw újraindítása..."
docker restart openclaw

echo ""
echo "Kész. Következő lépések:"
echo ""
echo "  1. Indíts egy agent sessiont, ami böngészőt használ (pl. 'nyisd meg a google.com-ot')"
echo "  2. Egy másik terminálban: ssh -L 16080:127.0.0.1:6080 root@23.88.58.202"
echo "  3. Böngészőben: http://localhost:16080/vnc_auto.html"
echo ""
echo "Ha a sandbox browser image hiányzik:"
echo "  cd /root/openclaw-repo && docker build -t openclaw-sandbox-browser:bookworm-slim -f Dockerfile.sandbox-browser ."
echo ""
