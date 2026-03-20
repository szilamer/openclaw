#!/usr/bin/env bash
# Óránkénti Stage 1: Qwen triage → MC register (awaiting_sophon) → mark-seen
# OpenClaw cron: futtasd ezt a scriptet, delivery/telegram NÉLKÜL.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
LIMIT="${1:-50}"
JSON="$(node scripts/imap.js triage --limit "$LIMIT")"
echo "$JSON" | node scripts/register-stage1-from-json.mjs
echo '{"ok":true,"stage":"stage1_hourly"}'
