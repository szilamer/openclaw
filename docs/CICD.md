# Mission Control — CI/CD Pipeline és Fejlesztési Szabályzat

> Utolsó frissítés: 2026-03-18

## Cursor agent — deploy és migráció (ne a felhasználó kapja feladatként)

A **Mission Control** (`taskmanager/**`) élesítése a **VPS-en** és a **Prisma `migrate deploy`** az **agent feladata**: commit + push `main` (GitHub Actions), vagy `cd taskmanager && ./scripts/deploy.sh`, ha van SSH.

**Ne** írjuk a felhasználónak külön „neked kell migrálni/deployolni” checklistát, ha az agent ezt megteheti. Kivétel: nincs git/SSH a környezetben → rövid javaslat: GitHub Actions **workflow_dispatch**.

Lásd még: `.cursor/rules/taskmanager-agent-access.mdc` (helyi Cursor szabály, ha nincs gitignore alól kivéve).

## Áttekintés

A Mission Control fejlesztése helyi gépen történik. A deploy két úton lehetséges:

1. **GitHub Actions** (ajánlott): push `main`-re → automatikus deploy. Lásd [docs/GITHUB_SETUP.md](GITHUB_SETUP.md).
2. **Manuális**: `./deploy-to-vps.sh` vagy `./scripts/deploy.sh`

```
Fejlesztés (lokális)     Deploy
┌──────────────────┐    ┌────────────────────────────────────────┐
│ Kód módosítás    │───▶│ GitHub: push main → Actions deploy      │
│ (frontend/backend)│    │ VAGY manuálisan: ./deploy-to-vps.sh    │
│                   │    │ rsync → Docker build → restart          │
│ git commit + push│    └────────────────────────────────────────┘
└──────────────────┘
```

---

## Parancsok

### CI ellenőrzés (commit előtt automatikus, vagy kézzel)

```bash
cd taskmanager
./scripts/ci.sh
```

Ellenőrzi:
1. Frontend TypeScript (`tsc --noEmit`)
2. Frontend build (`vite build`)
3. Backend TypeScript (`tsc --noEmit`)
4. Backend build (`nest build`)

Ha bármelyik hibás, a CI meghiúsul és nem enged deployolni.

### Teljes deploy

```bash
cd taskmanager
./scripts/deploy.sh
```

Lépések:
1. **CI ellenőrzés** — TypeScript + build
2. **Feltöltés** — rsync a VPS-re (node_modules, dist, .env kizárva)
3. **Docker build** — Frontend és backend image újraépítés a VPS-en
4. **Konténer restart** — Régi leállítás, új indítás
5. **Health check** — HTTP 200 és API health ellenőrzés

### Részleges deploy

```bash
./scripts/deploy.sh --frontend-only   # Csak frontend
./scripts/deploy.sh --backend-only    # Csak backend
./scripts/deploy.sh --skip-ci         # CI átugrás (sürgős hotfix)
```

---

## Git pre-commit hook

A repó inicializálásakor automatikusan beállított pre-commit hook futtatja a CI-t minden commit előtt:

```bash
# .git/hooks/pre-commit
#!/bin/bash
exec taskmanager/scripts/ci.sh
```

Ha a CI sikertelen, a commit meghiúsul.

---

## Fejlesztési szabályzat

### 1. Branch stratégia

| Branch | Cél | Deploy |
|---|---|---|
| `main` | Stabil, éles verzió | Automatikus a VPS-re |
| `feature/*` | Új funkciók | Nem deployol |
| `fix/*` | Hibajavítások | Nem deployol |

**Workflow:**
1. `feature/*` vagy `fix/*` branch-et hozol létre
2. Fejlesztés + helyi tesztelés
3. `./scripts/ci.sh` futtatás
4. Merge `main`-be
5. `./scripts/deploy.sh` futtatás

### 2. Commit szabályok

**Formátum:**
```
<típus>(<scope>): <rövid leírás>

[opcionális hosszabb leírás]
```

**Típusok:**
| Típus | Mikor |
|---|---|
| `feat` | Új funkció |
| `fix` | Hibajavítás |
| `refactor` | Átstrukturálás (nem változik a viselkedés) |
| `style` | UI/CSS módosítás |
| `docs` | Dokumentáció |
| `ci` | CI/CD pipeline módosítás |
| `chore` | Egyéb karbantartás |

**Scope:** `frontend`, `backend`, `infra`, `docs`

**Példák:**
```
feat(frontend): naptár nézet az Ütemezés oldalon
fix(backend): cron history endpoint üres tömb hibája
refactor(frontend): Layout sidebar balra mozgatás
ci: deploy script health check kiegészítés
```

### 3. Kód minőség

- **TypeScript strict mode** — Nincs `any` ahol elkerülhető
- **Tailwind CSS** — Inline utility classek, nincs custom CSS fájl
- **Magyar nyelvű UI** — Minden felhasználói szöveg magyarul
- **Nincs felesleges komment** — A kód legyen önmagát magyarázó
- **Komponens fájlméret** — Ha egy komponens > 500 sor, bontsd szét

### 4. Frontend konvenciók

- **Komponensek:** `/src/components/` — egy fájl = egy export
- **API hívások:** `/src/api.ts` — központi `fetchApi` wrapper
- **Típusok:** `/src/types.ts` — megosztott interfészek
- **Routing:** `/src/App.tsx` — központi route definíciók
- **Layout:** `Layout.tsx` wrapper, oldalak `<header>` + `<main>`
- **Design:** Dark theme (slate-950/900 háttér, amber-500 accent)

### 5. Backend konvenciók

- **NestJS moduláris felépítés** — Modul / Controller / Service hármas
- **Prisma ORM** — Schema: `backend/prisma/schema.prisma`
- **Guard:** `AgentTokenGuard` — minden API endpoint védett
- **Throttling:** 100 req/perc (globális)

### 6. Deploy checklist

Deploy előtt ellenőrizd:

- [ ] `./scripts/ci.sh` sikeres
- [ ] Új Prisma migráció szükséges? (`npx prisma migrate dev`)
- [ ] Új npm dependency? (`package.json` frissült)
- [ ] Új API endpoint? (Frontend `api.ts` frissült)
- [ ] Tesztelted telefonon is? (responsive, bottom bar)

### 7. Rollback

Ha a deploy után probléma van:

```bash
# VPS-en a régi image-ek megvannak
ssh root@23.88.58.202

# Frontend rollback: régebbi image-ek listája
docker images taskmanager_frontend

# Gyors rollback: konténer restart előző image-ből
docker stop taskmanager_frontend_1
docker rm taskmanager_frontend_1
docker run -d --name taskmanager_frontend_1 \
  --restart unless-stopped \
  --network taskmanager_default \
  -p 3010:80 \
  taskmanager_frontend:<KORÁBBI_TAG>
```

### 8. Adatbázis migráció

```bash
# Új migráció készítés (lokálisan)
cd taskmanager/backend
npx prisma migrate dev --name <leíró_név>

# Deploy automatikusan futtatja: npx prisma migrate deploy
```

---

## Monitoring

| Mit | Hogyan | URL |
|---|---|---|
| Frontend elérhető? | `curl https://sp.logframe.cc` | Böngészőből |
| Backend API health | `curl http://VPS:3000/api/health` | Tailscale-ről |
| Docker konténerek | `ssh VPS 'docker ps'` | SSH |
| OpenClaw státusz | `curl http://100.77.181.127:18789/` | Tailscale-ről |
| Cron futások | Mission Control → Ütemezés oldal | `sp.logframe.cc/schedule` |
| SSHFS mount | `ssh VPS 'mount \| grep sshfs'` | SSH |
| SSL lejárat | `ssh VPS 'certbot certificates'` | SSH |

---

## Vészhelyzeti eljárások

### Frontend nem töltődik
```bash
ssh root@23.88.58.202 'docker logs taskmanager_frontend_1 --tail 20'
ssh root@23.88.58.202 'docker restart taskmanager_frontend_1'
```

### Backend nem válaszol
```bash
ssh root@23.88.58.202 'docker logs taskmanager_backend_1 --tail 50'
ssh root@23.88.58.202 'bash /root/taskmanager/scripts/start-taskmanager-backend.sh'
```

### SSHFS mount leszakadt
```bash
ssh root@23.88.58.202 'sudo systemctl restart mnt-macmini\\x2dopenclaw.mount'
```

### SSL tanúsítvány lejár
```bash
ssh root@23.88.58.202 'sudo certbot renew'
```
