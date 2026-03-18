#!/bin/bash
# Mission Control — CI ellenőrzés (helyi futtatás)
# Használat: ./scripts/ci.sh
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
PASS=0
FAIL=0

green() { printf "\033[32m✓ %s\033[0m\n" "$1"; PASS=$((PASS+1)); }
red()   { printf "\033[31m✗ %s\033[0m\n" "$1"; FAIL=$((FAIL+1)); }
info()  { printf "\033[36m→ %s\033[0m\n" "$1"; }

info "Mission Control CI — futtatás"
echo ""

# ── 1. Frontend TypeScript ──
info "Frontend TypeScript ellenőrzés..."
if (cd "$ROOT/frontend" && npx tsc --noEmit 2>&1); then
  green "Frontend TypeScript: OK"
else
  red "Frontend TypeScript: HIBA"
fi

# ── 2. Frontend build ──
info "Frontend build..."
if (cd "$ROOT/frontend" && npm run build > /dev/null 2>&1); then
  green "Frontend build: OK"
else
  red "Frontend build: HIBA"
fi

# ── 3. Backend Prisma generate + TypeScript ──
info "Backend Prisma generate..."
(cd "$ROOT/backend" && npx prisma generate 2>&1 | tail -1)

info "Backend TypeScript ellenőrzés..."
if (cd "$ROOT/backend" && npx tsc --noEmit -p tsconfig.build.json 2>&1); then
  green "Backend TypeScript: OK"
else
  red "Backend TypeScript: HIBA"
fi

# ── 4. Backend compile ──
info "Backend compile check..."
if (cd "$ROOT/backend" && npx tsc -p tsconfig.build.json --noEmit 2>&1); then
  green "Backend compile: OK"
else
  red "Backend compile: HIBA"
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
printf "Eredmény: \033[32m%d OK\033[0m / \033[31m%d HIBA\033[0m\n" "$PASS" "$FAIL"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

if [ "$FAIL" -gt 0 ]; then
  echo ""
  printf "\033[31mCI SIKERTELEN — javítsd a hibákat deploy előtt!\033[0m\n"
  exit 1
fi

echo ""
printf "\033[32mCI SIKERES — deploy-ra kész.\033[0m\n"
