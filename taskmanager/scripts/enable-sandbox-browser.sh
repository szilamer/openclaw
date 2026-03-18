#!/bin/bash
# Böngészővezérlés engedélyezése a sandboxban – futtasd VPS-en: bash enable-sandbox-browser.sh
set -e

python3 << 'PYEOF'
import json
with open("/root/.openclaw/openclaw.json") as f:
    cfg = json.load(f)

# 1. Sandbox browser engedélyezése
if "agents" not in cfg:
    cfg["agents"] = {}
if "defaults" not in cfg["agents"]:
    cfg["agents"]["defaults"] = {}
if "sandbox" not in cfg["agents"]["defaults"]:
    cfg["agents"]["defaults"]["sandbox"] = {}
if "browser" not in cfg["agents"]["defaults"]["sandbox"]:
    cfg["agents"]["defaults"]["sandbox"]["browser"] = {}
cfg["agents"]["defaults"]["sandbox"]["browser"]["enabled"] = True

# 2. Browser tool engedélyezése (deny-ból kivéve)
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

with open("/root/.openclaw/openclaw.json", "w") as f:
    json.dump(cfg, f, indent=2)
print("OK: sandbox.browser.enabled=true, browser allowed in sandbox" + (f", executablePath={chrome_path}" if chrome_path else ""))
PYEOF

echo "OpenClaw újraindítása..."
docker restart openclaw
echo "Kész. Az agent most már használhatja a böngészőt."
