# Sophon Platform — Rendszer Architektúra

> Utolsó frissítés: 2026-03-16

## Áttekintés

A Sophon platform két fizikai gépen fut, amelyeket Tailscale mesh VPN köt össze. Az AI ágensek (OpenClaw) a dedikált Mac Minin futnak natív hozzáféréssel a géphez, míg a Mission Control (korábban TaskManager) a Hetzner VPS-en fut Docker konténerekben, HTTPS-en elérhető telefonról is.

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        INTERNET                                         │
│                                                                         │
│   Felhasználó (böngésző / telefon)                                      │
│       │                                                                 │
│       │ HTTPS (443)                                                     │
│       ▼                                                                 │
│   ┌─────────────────────────────────────────────────────────────────┐   │
│   │  HETZNER VPS (23.88.58.202)         Tailscale: 100.115.224.2   │   │
│   │  Ubuntu 22.04 · 4 vCPU · 8 GB RAM                              │   │
│   │                                                                 │   │
│   │  ┌─────────────┐    ┌──────────────────────────────────────┐   │   │
│   │  │   Nginx      │    │  Docker: taskmanager_default network │   │   │
│   │  │   (host)     │    │                                      │   │   │
│   │  │              │    │  ┌──────────┐  ┌──────────────────┐ │   │   │
│   │  │ sp.logframe  │───▶│  │ Frontend │  │     Backend      │ │   │   │
│   │  │ .cc:443 ──┐  │    │  │ (nginx)  │  │    (NestJS)      │ │   │   │
│   │  │           │  │    │  │ :3010→80 │  │    :3000         │ │   │   │
│   │  │    proxy  │  │    │  └────┬─────┘  └───────┬──────────┘ │   │   │
│   │  │    :3010  │  │    │       │ /api ──────────▶│            │   │   │
│   │  └───────────┘  │    │       │                 │            │   │   │
│   │                  │    │                    ┌────┴────┐      │   │   │
│   │                  │    │                    │PostgreSQL│      │   │   │
│   │                  │    │                    │ :5433→   │      │   │   │
│   │                  │    │                    │  5432    │      │   │   │
│   │                  │    │                    └─────────┘      │   │   │
│   │  ┌───────────────┴────────────────────────────────────┐    │   │   │
│   │  │ SSHFS mount: /mnt/macmini-openclaw                 │    │   │   │
│   │  │ ← sophon@100.77.181.127:/Users/sophon/.openclaw    │    │   │   │
│   │  └────────────────────────────────────────────────────┘    │   │   │
│   └─────────────────────────┬───────────────────────────────────┘   │
│                             │ Tailscale VPN                         │
│                             │ (WireGuard, titkosított)              │
│   ┌─────────────────────────┴───────────────────────────────────┐   │
│   │  MAC MINI (192.168.68.55)       Tailscale: 100.77.181.127   │   │
│   │  macOS 26.1 · Apple Silicon                                 │   │
│   │  Felhasználó: sophon                                         │   │
│   │                                                              │   │
│   │  ┌──────────────────┐  ┌───────────────┐  ┌──────────────┐ │   │
│   │  │ OpenClaw Gateway  │  │ Google Chrome  │  │   Ollama     │ │   │
│   │  │ v2026.3.13        │  │ CDP :9222      │  │  :11434      │ │   │
│   │  │ :18789 (LAN)      │  │ (böngésző      │  │  llama3.2:3b │ │   │
│   │  │                   │  │  vezérlés)      │  │              │ │   │
│   │  │ Ágensek:          │  └───────────────┘  └──────────────┘ │   │
│   │  │  • Sophon (fő)    │                                       │   │
│   │  │  • DingYi (tech)  │  ┌───────────────────────────────┐   │   │
│   │  │  • LuoJi (mktg)  │  │ Cron rendszer (3 aktív job)   │   │   │
│   │  │  • Da Shi (sec)   │  │  • TaskManager flow push (1h) │   │   │
│   │  └──────────────────┘  │  • Agent munkaterhelés (1h)    │   │   │
│   │                         │  • Email feldolgozás (1h)      │   │   │
│   │                         └───────────────────────────────┘   │   │
│   └──────────────────────────────────────────────────────────────┘   │
│                                                                      │
│   Telegram Bot API ◄──── Sophon agent (értesítések, parancsok)       │
└──────────────────────────────────────────────────────────────────────┘
```

---

## 1. Fizikai infrastruktúra

### 1.1 Hetzner VPS

| Tulajdonság | Érték |
|---|---|
| IP (publikus) | `23.88.58.202` |
| IP (Tailscale) | `100.115.224.2` |
| OS | Ubuntu 22.04.5 LTS |
| CPU / RAM | 4 vCPU / 8 GB |
| Hostname | `romify-production-new` |
| SSH | `root@23.88.58.202` (port 22) |
| Szerep | Mission Control hosting, HTTPS proxy, SSHFS bridge |

### 1.2 Mac Mini

| Tulajdonság | Érték |
|---|---|
| IP (LAN) | `192.168.68.55` |
| IP (Tailscale) | `100.77.181.127` |
| OS | macOS 26.1 (Apple Silicon) |
| Felhasználó | `sophon` (admin, passwordless sudo) |
| SSH | `sophon@192.168.68.55` vagy `sophon@100.77.181.127` |
| Szerep | OpenClaw gateway, AI ágensek, böngésző vezérlés, lokális LLM |

---

## 2. Szoftver komponensek

### 2.1 Mission Control (Frontend)

| | |
|---|---|
| Technológia | React 18 + TypeScript + Vite + Tailwind CSS |
| Docker image | `taskmanager_frontend:latest` |
| Konténer | `taskmanager_frontend_1` |
| Port | `3010 → 80` (nginx) |
| Elérhető | `https://sp.logframe.cc` |
| Forráskód | `/Users/feherszilamer/Projects/OpenClaw/taskmanager/frontend/` |
| VPS elérés | `/root/taskmanager/frontend/` |

**Oldalak:**

| Route | Komponens | Leírás |
|---|---|---|
| `/` | `ProjectList` | Projektcsoportok listája |
| `/project/:id` | `ProjectBoard` | Kanban tábla |
| `/project/:id/gantt` | `GanttView` | Gantt diagram |
| `/project/:id/settings` | `ProjectSettings` | Projekt beállítások |
| `/knowledge` | `KnowledgeBase` | Fájlkezelő + tudásgráf |
| `/resources` | `Resources` | Erőforrás monitoring |
| `/agents` | `AgentsDashboard` | Ügynök kezelés |
| `/schedule` | `ScheduleCalendar` | Naptár + cron ütemezés |

**Layout:** Bal oldali fix sidebar (64px) ikonokkal + mobil bottom bar.

### 2.2 Mission Control (Backend)

| | |
|---|---|
| Technológia | NestJS + Prisma ORM + PostgreSQL 16 |
| Docker image | `taskmanager_backend:latest` |
| Konténer | `taskmanager_backend_1` |
| Port | `3000` (csak Tailscale-en elérhető kívülről) |
| Forráskód | `/Users/feherszilamer/Projects/OpenClaw/taskmanager/backend/` |
| Hitelesítés | Bearer token (`AgentToken`, bcrypt hash) |

**API modulok:**

| Modul | Endpoint prefix | Funkció |
|---|---|---|
| Projects | `/api/projects` | Projektcsoportok, alprojektek, kontaktok, KB szinkron |
| Tasks | `/api/tasks` | Feladatok CRUD, mozgatás, kommentek, live status |
| Resources | `/api/resources` | Erőforrás summary, cron jobok, használati statisztika |
| Agents | `/api/agents` | Ügynök lista, aktivitás, modell kezelés |
| Files | `/api/files` | Fájlfa böngészés, tartalom olvasás/írás |
| Emails | `/api/emails` | Email feldolgozás |
| Reports | `/api/reports` | Riportok |
| Users | `/api/users` | Felhasználó kezelés |
| Health | `/api/health` | Egészség ellenőrzés |

### 2.3 PostgreSQL

| | |
|---|---|
| Image | `postgres:16-alpine` |
| Konténer | `c7e29cbd2be1_taskmanager_postgres_1` |
| Port | `5433 → 5432` (csak Docker hálózaton belülről a backend éri el) |
| Adatbázis | `taskmanager` |
| Volume | `taskmanager_pgdata` (Docker named volume) |

### 2.4 OpenClaw Gateway

| | |
|---|---|
| Verzió | 2026.3.13 |
| Fut | Mac Mini, natív (nem Docker) |
| Port | `18789` (LAN bind) |
| Node.js | v22.22.1 (`/opt/homebrew/opt/node@22/bin/node`) |
| Config | `/Users/sophon/.openclaw/openclaw.json` |
| Workspace | `/Users/sophon/.openclaw/workspace/` |
| Auto-start | `launchd` (`com.openclaw.gateway.plist`) |
| Sandbox | Kikapcsolva (`mode: off`) |

### 2.5 AI Ágensek

| Agent ID | Név | Szerep |
|---|---|---|
| `sophon` | Sophon | Fő koordinátor, feladat-triage, email feldolgozás |
| `dingyi` | DingYi 🔧 | Technikai/fejlesztési feladatok |
| `luoji` | LuoJi 📢 | Marketing, UX, kommunikáció |
| `dashi` | Da Shi 🛡️ | Biztonság, audit, policy |

**Modell konfiguráció:**
- Primary: `openai-codex/gpt-5.3-codex` (OAuth)
- Fallbacks: `gpt-5.1-codex`, `gpt-5.3-codex-spark`, `gpt-5.1-codex-mini`
- Lokális: `ollama/llama3.2:3b` (elérhető, de nem default)

### 2.6 Chrome (CDP mód)

| | |
|---|---|
| Verzió | Chrome 146.0.7680.80 |
| CDP port | `9222` |
| Profil | `/Users/sophon/.openclaw/chrome-profile/` |
| Auto-start | `launchd` (`com.sophon.chrome-cdp.plist`, Aqua session) |
| Használat | Böngésző automatizálás (Playwright), web scraping |

### 2.7 Ollama (lokális LLM)

| | |
|---|---|
| Port | `11434` |
| Modell | `llama3.2:3b` (Q4_K_M, ~2 GB) |
| Auto-start | `launchd` (`homebrew.mxcl.ollama.plist`) |

---

## 3. Kommunikációs csatornák

### 3.1 Hálózat

```
                    Tailscale VPN (WireGuard)
Mac Mini ◄─────────────────────────────────────────────► VPS
100.77.181.127                                    100.115.224.2
     │                                                  │
     │ LAN: 192.168.68.55                              │ Public: 23.88.58.202
     │                                                  │
     │ OpenClaw :18789                                  │ Nginx :443 (HTTPS)
     │ Chrome CDP :9222                                 │ Frontend :3010
     │ Ollama :11434                                    │ Backend :3000
                                                        │ PostgreSQL :5433
```

| Útvonal | Protokoll | Port | Leírás |
|---|---|---|---|
| Felhasználó → VPS | HTTPS | 443 | `sp.logframe.cc` → Mission Control UI |
| VPS nginx → Frontend konténer | HTTP | 3010 | Reverse proxy |
| Frontend → Backend (konténeren belül) | HTTP | 3000 | API proxy (`/api`) |
| Backend → PostgreSQL | TCP | 5432 | Docker network (`taskmanager_default`) |
| Mac Mini → VPS Backend | HTTP/Tailscale | 3000 | OpenClaw → Mission Control API |
| VPS → Mac Mini (SSHFS) | SSH/Tailscale | 22 | `/mnt/macmini-openclaw` mount |
| OpenClaw → LLM | HTTPS | 443 | OpenAI Codex OAuth API |
| OpenClaw → Ollama | HTTP | 11434 | Lokális LLM inferencia |
| Sophon → Telegram | HTTPS | 443 | Felhasználói értesítések, parancsok |

### 3.2 SSHFS bridge

A VPS-en systemd mount unit (`mnt-macmini\x2dopenclaw.mount`) csatolja a Mac Mini OpenClaw adatait:
```
sophon@100.77.181.127:/Users/sophon/.openclaw → /mnt/macmini-openclaw
```
Ezáltal a Mission Control backend hozzáfér az ágensek fájljaihoz, logokhoz és konfigurációhoz.

### 3.3 Telegram integráció

- **Irány:** Sophon agent ↔ Felhasználó (Fehér Szilamér)
- **Telegram ID:** `8039153889`
- **Funkciók:** Cron futás értesítések, direkt parancsok az ágensnek, task frissítések
- **Delivery mode:** `announce` (bestEffort: true)

### 3.4 SSL/TLS

| Domain | Tanúsítvány | Kiállító |
|---|---|---|
| `sp.logframe.cc` | `/etc/letsencrypt/live/sp.logframe.cc/` | Let's Encrypt (Certbot, auto-renewal) |

---

## 4. Docker hálózat (VPS)

```
taskmanager_default network:
  ├── taskmanager_frontend_1  (alias: frontend)   :3010→80
  ├── taskmanager_backend_1   (alias: backend)     :3000
  └── taskmanager_postgres_1  (alias: postgres)    :5433→5432
```

A frontend konténer nginx-e a `/api` kéréseket a `backend:3000`-re proxyzza.

---

## 5. Cron rendszer

Az OpenClaw beépített cron rendszere a Mac Minin fut (`maxConcurrentRuns: 3`).

| Job | Ütemezés | Mód | Leírás |
|---|---|---|---|
| TaskManager flow push | `0 8-18 * * *` (CET) | isolated | Task triage, agent spawn, stale detection – óránként |
| Agent munkaterhelés check | `30 8-18 * * *` (CET) | isolated | Aktív futások ellenőrzése, spawn pótlás – óránként |
| Email feldolgozás | `15 8-18 * * *` (CET) | isolated | `email_cron_atomic.sh` futtatás – óránként |

**Kikapcsolt jobok:** Félórás browser-fix, 15p triage, email utóaudit, Dingyi terhelés őr.

---

## 6. Tűzfal (UFW — VPS)

| Port | Szabály | Megjegyzés |
|---|---|---|
| 22 | ALLOW | SSH |
| 80, 443 | ALLOW | HTTP/HTTPS |
| 3000 (tailscale0) | ALLOW | Backend API csak Tailscale-ről |
| 3001, 3002 | ALLOW | Romify (másik projekt) |
| 3010 | ALLOW | Mission Control frontend |
| 5432, 6379 | DENY | PostgreSQL, Redis (védett) |
| 5900, 5901, 6080, 6082, 6088 | DENY | VNC portok (lezárva) |

---

## 7. Launchd szolgáltatások (Mac Mini)

| Plist | Szolgáltatás | KeepAlive |
|---|---|---|
| `com.openclaw.gateway.plist` | OpenClaw Gateway | Igen |
| `com.sophon.chrome-cdp.plist` | Chrome CDP mód | Nem (Aqua session) |
| `homebrew.mxcl.ollama.plist` | Ollama LLM szerver | Igen |

---

## 8. Fájlrendszer térkép

### VPS (`root@23.88.58.202`)
```
/root/
├── taskmanager/
│   ├── frontend/          ← Mission Control frontend forráskód
│   ├── backend/           ← Mission Control backend forráskód
│   ├── scripts/           ← Deploy/admin scriptek
│   ├── docker-compose.yml
│   └── deploy-to-vps.sh
├── .openclaw/             ← (régi, migrálás előtti OpenClaw adat)
/mnt/macmini-openclaw/     ← SSHFS mount → Mac Mini /Users/sophon/.openclaw
/etc/nginx/sites-available/
└── sp.logframe.cc         ← Nginx HTTPS config
```

### Mac Mini (`sophon@192.168.68.55`)
```
/Users/sophon/
├── .openclaw/
│   ├── openclaw.json          ← Fő konfiguráció
│   ├── workspace/             ← Agent workspace
│   │   ├── ENVIRONMENT.md
│   │   ├── SOUL.md
│   │   ├── scripts/
│   │   └── output/            ← Agent kimeneti fájlok
│   ├── agents/
│   │   ├── sophon/
│   │   ├── dingyi/
│   │   ├── luoji/
│   │   └── dashi/
│   ├── cron/
│   │   ├── jobs.json          ← Cron job definíciók
│   │   └── runs/              ← Futási logok
│   ├── memory/                ← Agent memória (SQLite + vector)
│   ├── logs/                  ← Gateway logok
│   └── chrome-profile/        ← Chrome CDP profil
├── Library/LaunchAgents/      ← launchd plist-ek
```

### Fejlesztői gép (lokális)
```
/Users/feherszilamer/Projects/OpenClaw/
├── taskmanager/
│   ├── frontend/              ← Fejlesztés itt történik
│   ├── backend/
│   ├── docker-compose.yml
│   └── deploy-to-vps.sh
└── docs/
    └── ARCHITECTURE.md        ← Ez a dokumentum
```

---

## 9. Hitelesítés

| Rendszer | Módszer | Részletek |
|---|---|---|
| Mission Control UI | Bearer token | `tm_*` prefixű token, localStorage-ban |
| Mission Control API | Bearer token (bcrypt) | `AgentToken` tábla PostgreSQL-ben |
| OpenClaw → MC API | Bearer token | Env: `TASKMANAGER_TOKEN` a launchd plist-ben |
| OpenClaw LLM | OAuth | OpenAI Codex OAuth token |
| SSH (VPS) | SSH kulcs | root kulcs |
| SSH (Mac Mini) | SSH kulcs | sophon felhasználó |
| Tailscale | Tailscale auth | `szilamer@` fiók |
| SSL | Let's Encrypt | Auto-renewal (Certbot) |
