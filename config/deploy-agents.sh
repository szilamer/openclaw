#!/usr/bin/env bash
# Deploy agents config to VPS and create agent directories.
# Usage: ./deploy-agents.sh [vps_host]
# Default VPS: root@23.88.58.202

set -e
VPS="${1:-root@23.88.58.202}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "Deploying agents config to $VPS..."

# Merge agents patch into existing config (run locally)
scp -q "$VPS:/root/.openclaw/openclaw.json" /tmp/openclaw-current.json
jq --slurpfile patch "$SCRIPT_DIR/agents-patch.json" \
  '.agents.defaults = ((.agents.defaults // {}) * ($patch[0].agents.defaults // {})) | .agents.list = ($patch[0].agents.list // [])' \
  /tmp/openclaw-current.json > /tmp/openclaw-merged.json

# Backup and replace
ssh "$VPS" "cp /root/.openclaw/openclaw.json /root/.openclaw/openclaw.json.bak.$(date +%Y%m%d%H%M%S)"
scp /tmp/openclaw-merged.json "$VPS:/root/.openclaw/openclaw.json"

# Create agent directories and workspaces
ssh "$VPS" "
  mkdir -p /home/node/.openclaw/workspace-dingyi
  mkdir -p /home/node/.openclaw/workspace-luoji
  mkdir -p /home/node/.openclaw/workspace-dashi
  mkdir -p /home/node/.openclaw/agents/dingyi/agent
  mkdir -p /home/node/.openclaw/agents/luoji/agent
  mkdir -p /home/node/.openclaw/agents/dashi/agent
"

echo "Config deployed. Copying workspace files..."
scp "$SCRIPT_DIR/agents/dingyi/AGENTS.md" "$VPS:/tmp/dingyi-AGENTS.md"
scp "$SCRIPT_DIR/agents/dingyi/SOUL.md" "$VPS:/tmp/dingyi-SOUL.md"
scp "$SCRIPT_DIR/agents/dingyi/TOOLS.md" "$VPS:/tmp/dingyi-TOOLS.md"
scp "$SCRIPT_DIR/agents/luoji/AGENTS.md" "$VPS:/tmp/luoji-AGENTS.md"
scp "$SCRIPT_DIR/agents/dashi/AGENTS.md" "$VPS:/tmp/dashi-AGENTS.md"

ssh "$VPS" "
  cp /tmp/dingyi-AGENTS.md /root/.openclaw/workspace-dingyi/AGENTS.md
  cp /tmp/dingyi-SOUL.md /root/.openclaw/workspace-dingyi/SOUL.md
  cp /tmp/dingyi-TOOLS.md /root/.openclaw/workspace-dingyi/TOOLS.md
  cp /tmp/luoji-AGENTS.md /root/.openclaw/workspace-luoji/AGENTS.md
  cp /tmp/dashi-AGENTS.md /root/.openclaw/workspace-dashi/AGENTS.md
  chown -R 1000:1000 /root/.openclaw/workspace-dingyi /root/.openclaw/workspace-luoji /root/.openclaw/workspace-dashi
  rm -f /tmp/dingyi-AGENTS.md /tmp/dingyi-SOUL.md /tmp/dingyi-TOOLS.md /tmp/luoji-AGENTS.md /tmp/dashi-AGENTS.md
"

echo "Done. Restart the gateway to apply changes."
