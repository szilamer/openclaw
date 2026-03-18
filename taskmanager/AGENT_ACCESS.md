# TaskManager API – Agent (OpenClaw/Sophon) hozzáférés

Az agent a `taskmanager-api` scripten keresztül éri el az API-t. A hozzáférés működéséhez:

## Követelmények

1. **Backend** a `taskmanager_default` hálózaton, **`backend` alias**-szal
2. **OpenClaw** ugyanazon a hálózaton, `TASKMANAGER_URL=http://backend:3000/api` env-vel
3. **Sandbox** a `taskmanager_default` hálózaton (OpenClaw config: `agents.defaults.sandbox.docker.network: "taskmanager_default"`)

## Backend indítás (fontos)

A backend **mindig** `--network-alias backend` paraméterrel induljon, különben az agent nem tudja feloldani a `backend` hostnevet.

```bash
# VPS-en
docker rm -f taskmanager_backend_1 2>/dev/null
docker run -d \
  --name taskmanager_backend_1 \
  --restart unless-stopped \
  --network taskmanager_default \
  --network-alias backend \
  -p 3000:3000 \
  -e DATABASE_URL=postgresql://taskmanager:taskmanager@postgres:5432/taskmanager \
  -e PORT=3000 \
  -e ALLOW_ALL_IPS=true \
  taskmanager_backend:latest
```

## Ellenőrzés

```bash
docker exec openclaw taskmanager-api GET projects
```

Ha működik, JSON választ kapsz. Ha "Could not resolve host: backend" → a backend nincs `backend` alias-szal.

## VPS újraindítás után

1. Postgres: `docker start $(docker ps -aq -f name=taskmanager_postgres)`
2. Backend: a fenti `docker run` parancs (vagy `./scripts/start-taskmanager-backend.sh`)
3. OpenClaw: `bash /root/start-openclaw.sh`

## Böngészővezérlés („nem éri el” / „No supported browser found”)

Ha az agent azt mondja, hogy a böngészővezérlést nem éri el, vagy „No supported browser found”:

```bash
# VPS-en
cd /root/taskmanager && bash scripts/enable-sandbox-browser.sh
```

Ha a host böngésző (running=false) nem indul, add hozzá az `openclaw.json`-hoz a Playwright Chromium útvonalát:

```bash
# VPS-en – Chromium path keresése
docker exec openclaw find /home/node/.cache/ms-playwright -name chrome -type f | head -1

# Ezt az útvonalat add hozzá: browser.executablePath
```

## Böngésző megtekintése (te is lásd, amit az agent)

A jelenlegi setup **host böngésző** headed módban + noVNC. A `start-openclaw-patch.sh` már tartalmazza a szükséges env-eket.

**Lokálisan (Mac újraindítás után):**

1. `ssh -L 16081:127.0.0.1:6080 root@23.88.58.202`
2. Böngészőben: http://localhost:16081/vnc_auto.html
3. Jelszó: `openclaw1`

**Részletes deploy és használati útmutató:** [DEPLOY_BROWSER.md](./DEPLOY_BROWSER.md)

## Timeout / kapcsolati hiba

Ha az agent „connection timeout” vagy „23.88.58.202:3000 nem válaszol” hibát kap:

- **Ne** használjon külső IP-t (23.88.58.202) – a sandbox/exec a `backend` hostnevet használja.
- Ellenőrizd: `agents.defaults.sandbox.docker.network` = `"taskmanager_default"` az OpenClaw configban (`/root/.openclaw/openclaw.json`).
- Régi sandbox eltávolítása (új config hash miatt új sandbox jön létre):  
  `docker ps -a | grep openclaw-sbx` → `docker stop/rm <container>`
