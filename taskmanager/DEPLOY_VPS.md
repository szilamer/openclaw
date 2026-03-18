# TaskManager VPS deploy (Hetzner)

## 1. Kód feltöltése

```bash
# Opció A: rsync (ha van SSH)
rsync -avz --exclude node_modules --exclude .env /Users/feherszilamer/Projects/OpenClaw/taskmanager/ root@23.88.58.202:/root/taskmanager/

# Opció B: git (ha a taskmanager a repóban van)
ssh root@23.88.58.202 "cd /root && git clone ... && cd taskmanager"
```

## 2. .env létrehozása a VPS-en

```bash
ssh root@23.88.58.202
```

A VPS-en:
```bash
cat > /root/taskmanager/backend/.env << 'EOF'
DATABASE_URL="postgresql://taskmanager:taskmanager@postgres:5432/taskmanager"
PORT=3000
EOF
```

**Fontos:** A backend Dockerban fut, ezért a hostnév `postgres` (a docker-compose service neve).

## 3. Docker Compose indítás

```bash
cd /root/taskmanager
docker compose up -d
```

## 4. Migráció + token generálás

```bash
# Migráció
docker exec taskmanager-backend-1 npx prisma migrate deploy

# Token generálás (a kimenetet mentsd el!)
docker exec taskmanager-backend-1 npx ts-node scripts/generate-agent-token.ts
```

## 5. taskmanager-api script az OpenClaw-hoz

```bash
# Lokálisan - script másolása
scp /Users/feherszilamer/Projects/OpenClaw/taskmanager/scripts/taskmanager-api root@23.88.58.202:/root/.openclaw/scripts/
ssh root@23.88.58.202 "chmod +x /root/.openclaw/scripts/taskmanager-api"
```

## 6. OpenClaw container – taskmanager-api + env

A TaskManager és az OpenClaw **ugyanazon a hoston** fut. A backend a 3000-es porton.

**A) Ha külön Docker hálózatban:** Az OpenClaw containerből a hostra: `http://host.docker.internal:3000` (Mac) vagy `http://172.17.0.1:3000` (Linux host IP).

**B) Ha egy docker networkben:** Adj hozzá a TaskManager-t és az OpenClaw-ot ugyanahhoz a networkhez, és használd: `http://taskmanager-backend-1:3000`.

**Egyszerűbb:** A start-openclaw.sh-t módosítsd, hogy a taskmanager-api script kapja az env-et:
- `TASKMANAGER_URL=http://172.17.0.1:3000/api` (host IP a containerből)
- `TASKMANAGER_TOKEN=<a generált token>`

Vagy: a scriptbe írd bele a tokent (chmod 600), mint a trello-api-nál.

## 7. Ellenőrzés

```bash
# Health
curl http://23.88.58.202:3000/api/health

# Projektek (tokennel)
curl -H "Authorization: Bearer TM_TOKEN" http://23.88.58.202:3000/api/projects
```

## 8. Port megnyitása (opcionális)

Ha kívülről is elérhető legyen a 3000-es port:
```bash
# UFW vagy iptables - csak ha szükséges
```

Alternatíva: Caddy reverse proxy a `taskmanager.logframe.cc` domainhez (később).

---

## 9. Böngészővezérlés + noVNC

Ha az agent böngészőt használ, és te is látni szeretnéd (noVNC):

- **Indítás:** mindig `start-openclaw-patch.sh` (nem más start script)
- **Deploy után:** lásd [DEPLOY_BROWSER.md](./DEPLOY_BROWSER.md) – mi kell, hogy a böngészőhasználat megmaradjon
