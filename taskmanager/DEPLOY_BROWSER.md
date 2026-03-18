# Böngészővezérlés + noVNC – deploy és használat

Ez a dokumentum leírja, mit kell megőrizni és mit kell használni, hogy a böngészőhasználati lehetőségek (agent + te is láthatod noVNC-n keresztül) megmaradjanak egy újabb deployoláskor, illetve saját gép újraindítása után.

---

## 1. Mi kell a böngészőhöz (agent + megtekintés)

| Komponens | Szerepe |
|-----------|---------|
| **openclaw-with-browser** image | Xvfb, noVNC, websockify, x11vnc, Playwright Chromium, entrypoint |
| **start-openclaw-patch.sh** | Indítja az OpenClaw-ot a megfelelő env-ekkel és portokkal |
| **openclaw.json** config | `browser.headless: false`, `sandbox.mode: "off"` |

---

## 2. Deployoláskor – mi maradjon meg

### Kritikus: mindig a `start-openclaw-patch.sh`-t használd

A `start-openclaw-patch.sh` tartalmazza a böngészőhöz szükséges beállításokat:

- `-p 127.0.0.1:6080:6080` – noVNC port
- `-e OPENCLAW_BROWSER_HEADLESS=0`
- `-e OPENCLAW_BROWSER_ENABLE_NOVNC=1`
- `-e OPENCLAW_BROWSER_NOVNC_PASSWORD=openclaw1`
- `--group-add` – Docker socket hozzáférés

**Ne** használj más start scriptet (pl. `start-openclaw.sh`) – azok nem tartalmazzák ezeket.

### Image build – architektúra

A VPS x86_64. Ha Mac ARM-ről buildelsz, az image nem fog futni a VPS-en (`exec format error`).

**Opció A: Build a VPS-en (ajánlott)**

```bash
# Repo szinkron
rsync -avz --exclude node_modules --exclude .git repo/ root@23.88.58.202:/root/openclaw-repo/

# Build a VPS-en
ssh root@23.88.58.202 'cd /root/openclaw-repo && docker build --build-arg OPENCLAW_INSTALL_BROWSER=1 -t openclaw-with-browser .'

# Indítás
ssh root@23.88.58.202 'cd /root/taskmanager && bash start-openclaw-patch.sh'
```

**Opció B: Deploy script (ha Mac és VPS azonos architektúra)**

```bash
cd taskmanager && bash scripts/deploy-openclaw-novnc-fix.sh
```

### Config megőrzése

A `/root/.openclaw/openclaw.json` a hostra van mountolva, tehát deploy után is megmarad. Ellenőrizd, hogy tartalmazza:

```json
{
  "browser": {
    "enabled": true,
    "headless": false,
    "noSandbox": true,
    "executablePath": "/home/node/.cache/ms-playwright/chromium-1208/chrome-linux64/chrome"
  },
  "agents": {
    "defaults": {
      "sandbox": {
        "mode": "off"
      }
    }
  }
}
```

---

## 3. Saját gép (Mac) újraindítása után

A VPS külön fut, tehát az OpenClaw továbbra is fut. Csak a Macről kell elérni.

### Lépések

| # | Lépés | Parancs / művelet |
|---|-------|-------------------|
| 1 | SSH tunnel | `ssh -L 16081:127.0.0.1:6080 root@23.88.58.202` |
| 2 | noVNC megnyitása | Böngésző: http://localhost:16081/vnc_auto.html |
| 3 | Bejelentkezés | Jelszó: `openclaw1` |

A terminál ablak (SSH tunnel) maradjon nyitva, amíg a noVNC-t használod.

### Ha a VPS is újraindult

```bash
ssh root@23.88.58.202
cd /root/taskmanager && bash start-openclaw-patch.sh
```

Vagy ha a Docker már fut, de az OpenClaw nem:

```bash
docker start openclaw
```

---

## 4. Repo változtatások – commitolás

A böngészőhöz szükséges kód a repóban van. Deploy előtt commitold őket, hogy ne veszítsd el:

- `repo/Dockerfile` – noVNC csomagok, entrypoint
- `repo/scripts/docker-entrypoint-with-browser.sh`
- `repo/src/browser/chrome.ts` – headed Chrome stabilitás (--disable-gpu, --no-zygote, DISPLAY)
- `taskmanager/start-openclaw-patch.sh` – env-ek, port 6080, jelszó

---

## 5. Gyors ellenőrzés

```bash
# OpenClaw fut?
ssh root@23.88.58.202 'docker ps | grep openclaw'

# noVNC válaszol?
ssh root@23.88.58.202 'curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:6080/vnc_auto.html'
# Várt: 200
```
