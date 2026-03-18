#!/usr/bin/env bash
# Sophon cron jobok óránkénti futásra állítása (8–18 között)
# Használat: ./update-cron-hourly.sh [vps_host]
# Alapértelmezett: root@23.88.58.202

set -e
VPS="${1:-root@23.88.58.202}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "Cron jobok óránkénti futásra állítása 8–18 között ($VPS)..."

# Letöltés: Mac Mini mount, vagy docker, vagy root .openclaw
ssh "$VPS" "cat /mnt/macmini-openclaw/cron/jobs.json 2>/dev/null || docker exec openclaw cat /home/node/.openclaw/cron/jobs.json 2>/dev/null || cat /root/.openclaw/cron/jobs.json 2>/dev/null" > /tmp/cron_jobs.json || {
  echo "Hiba: nem sikerült letölteni a jobs.json-t"
  exit 1
}

# Módosítás: TaskManager és Agent jobok -> óránként 8–18 (CET)
python3 << 'PY'
import json
with open("/tmp/cron_jobs.json") as f:
    j = json.load(f)

# Óránkénti cron 8–18: TaskManager :00, Agent :30, Email :15 (eltolva)
TASK_SCHEDULES = {
    "TaskManager": {"kind": "cron", "expr": "0 8-18 * * *", "tz": "Europe/Budapest"},
    "Agent": {"kind": "cron", "expr": "30 8-18 * * *", "tz": "Europe/Budapest"},
    "Email": {"kind": "cron", "expr": "15 8-18 * * *", "tz": "Europe/Budapest"},
}

for job in j.get("jobs", []):
    name = job.get("name", "")
    s = job.get("schedule", {})
    for key, new_sched in TASK_SCHEDULES.items():
        if key in name:
            old = s.get("expr") or s.get("everyMs") or str(s)
            job["schedule"] = new_sched.copy()
            print(f"  {name}: {old} -> {new_sched['expr']} (óránként 8–18)")
            break

with open("/tmp/cron_jobs.json", "w") as f:
    json.dump(j, f, indent=2, ensure_ascii=False)
PY

# Feltöltés: Mac Mini mount (elsődleges) vagy VPS .openclaw
scp /tmp/cron_jobs.json "$VPS:/tmp/cron_jobs.json"
if ssh "$VPS" "test -d /mnt/macmini-openclaw/cron" 2>/dev/null; then
  ssh "$VPS" "cp /tmp/cron_jobs.json /mnt/macmini-openclaw/cron/jobs.json"
  echo "  -> /mnt/macmini-openclaw/cron/jobs.json (Mac Mini)"
else
  ssh "$VPS" "mkdir -p /root/.openclaw/cron && cp /tmp/cron_jobs.json /root/.openclaw/cron/jobs.json"
  echo "  -> /root/.openclaw/cron/jobs.json"
fi

echo "Kész. A gateway automatikusan betölti az új ütemezést."
