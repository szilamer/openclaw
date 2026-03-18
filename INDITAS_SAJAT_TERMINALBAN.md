# OpenClaw Docker – indítás a saját terminálban

**Fontos:** Futtasd ezeket a parancsokat a **Mac saját Termináljában** (Terminal.app vagy iTerm), **nem** a Cursor beépített termináljában. Így a Docker Desktop fogja látni és kezelni a konténereket.

---

## 1. Docker Desktop

- Indítsd el a **Docker Desktop** alkalmazást, és várj, amíg teljesen feláll (zöld pipa / "Engine running").

---

## 2. Parancsok másolása és futtatása

Nyisd meg a **Terminal.app**-ot (Spotlight: Cmd+Space → "Terminal"), majd másold be és futtasd **sorban**:

```bash
cd /Users/feherszilamer/Projects/OpenClaw/repo
```

```bash
docker compose pull openclaw-gateway
```

(Ez letölti az image-et, ~4 GB, ezért 2–5 perc is lehet. A Docker Desktop **Images** fülén megjelenik: `ghcr.io/openclaw/openclaw:main`.)

```bash
docker compose up -d openclaw-gateway
```

(Ez elindítja a gateway konténert. A Docker Desktop **Containers** fülén megjelenik az `openclaw-gateway`.)

---

## 3. Ellenőrzés

- **Docker Desktop → Containers:** legyen egy futó konténer: `repo-openclaw-gateway-1` (vagy hasonló név).
- Böngészőben nyisd meg: **http://127.0.0.1:18789/**
- **Token** (Settings → token mezőbe):  
  `6f523e3a539b14de6f5530f8af498400c70d28fcb3839982b86853e79931d4d1`

---

## 4. Ha valami nem működik

- **"no such image" / image hiányzik:** futtasd újra a `docker compose pull openclaw-gateway` parancsot.
- **"port already in use":** valami más használja a 18789-es portot; állítsd le, vagy írd át a `.env`-ben a `OPENCLAW_GATEWAY_PORT` értékét (pl. `127.0.0.1:18790`).
- **Konténer azonnal leáll:**  
  `cd /Users/feherszilamer/Projects/OpenClaw/repo`  
  majd: `docker compose logs openclaw-gateway`  
  A kimenetből kiderül, mi a hiba.

---

## 5. Leállítás

```bash
cd /Users/feherszilamer/Projects/OpenClaw/repo
docker compose down
```
