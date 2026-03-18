# TaskManager VPS deploy – KÉSZ

## Státusz
- ✅ TaskManager fut: http://23.88.58.202:3000
- ✅ Health: http://23.88.58.202:3000/api/health
- ✅ API docs: http://23.88.58.202:3000/api/docs
- ✅ taskmanager-api script: `/root/.openclaw/scripts/taskmanager-api`

## Agent token (biztonságosan tárold)
```
tm_xxx... (generate-agent-token script)
```

## OpenClaw integráció – következő lépések

### 1. taskmanager-api mount az OpenClaw containerbe
A `start-openclaw.sh`-t úgy kell módosítani, hogy a taskmanager-api is bekerüljön:
```bash
-v /root/.openclaw/scripts/taskmanager-api:/usr/local/bin/taskmanager-api
```

### 2. Env változók az OpenClaw containerben
```bash
-e TASKMANAGER_URL=http://172.17.0.1:3000/api
-e TASKMANAGER_TOKEN=\$TASKMANAGER_TOKEN
```
(A 172.17.0.1 a Docker host IP a containerből.)

### 3. TOOLS.md frissítése
Adj hozzá a taskmanager-api használati útmutatót a Trello mellett.

### 4. Cron jobok átállítása
Ha készen állsz, a cron payload-okban cseréld a `trello-api` hívásokat `taskmanager-api`-ra.

---

## Böngésző + noVNC

- OpenClaw indítás: `start-openclaw-patch.sh` (böngésző env-ekkel)
- noVNC: `ssh -L 16081:127.0.0.1:6080 root@23.88.58.202` → http://localhost:16081/vnc_auto.html (jelszó: openclaw1)
- Részletek: [DEPLOY_BROWSER.md](./DEPLOY_BROWSER.md)

---
*IP check jelenleg kikapcsolva (allowedIps=null). Prod-ban állítsd vissza: 23.88.58.202, 172.17.*
