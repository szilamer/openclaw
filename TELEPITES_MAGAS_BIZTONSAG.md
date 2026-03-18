# OpenClaw telepítés magas biztonsági beállításokkal

Ez az útmutató az OpenClaw Docker-alapú telepítését és a későbbi Linux VPS-re költöztetését írja le, **maximális biztonsági szinttel**.

---

## 1. Előfeltételek

- **Docker Desktop** vagy **Docker Engine** + **Docker Compose v2**
- **Node.js ≥22** (ha CLI-t használsz a hoston)
- Elég hely a képeknek és logoknak

---

## 2. Docker környezet – gyors indulás

### 2.1 Klónozás és indítás

```bash
git clone https://github.com/openclaw/openclaw.git
cd openclaw

# Automatikus setup: token generálás, gateway indítás, onboarding
./docker-setup.sh
```

A script:
- generál egy gateway tokent és `.env`-be írja
- Docker Compose-szal elindítja a gateway-t
- futtatja az onboarding varázslót
- buildeli a gateway image-t

### 2.2 Alternatíva: előre buildelt image

```bash
docker pull ghcr.io/openclaw/openclaw:latest
docker run -d --name openclaw \
  -p 127.0.0.1:18789:18789 \
  -v ~/.openclaw:/home/node/.openclaw \
  ghcr.io/openclaw/openclaw:latest
```

**Fontos:** A `127.0.0.1:` prefix miatt csak localhostról érhető el – ez biztonságos alapértelmezés.

### 2.3 Első hozzáférés

- URL: `http://127.0.0.1:18789/`
- A tokent a Control UI-ban: **Settings → token**
- Ha újra kell a dashboard link:  
  `docker compose run --rm openclaw-cli dashboard --no-open`

---

## 3. Magas biztonsági konfiguráció

### 3.1 Hardened baseline (ajánlott kiindulás)

A `~/.openclaw/openclaw.json` fájlban (vagy a Docker volume-ban) használd ezt a kiinduló konfigurációt:

```json5
{
  gateway: {
    mode: "local",
    bind: "loopback",
    port: 18789,
    auth: { mode: "token", token: "IDE-GENERALT-HOSSZU-TOKEN" },
  },
  session: {
    dmScope: "per-channel-peer",
  },
  tools: {
    profile: "messaging",
    deny: [
      "group:automation",
      "group:runtime",
      "group:fs",
      "sessions_spawn",
      "sessions_send",
    ],
    fs: { workspaceOnly: true },
    exec: { security: "deny", ask: "always" },
    elevated: { enabled: false },
  },
  channels: {
    whatsapp: {
      dmPolicy: "pairing",
      groups: { "*": { requireMention: true } },
    },
  },
}
```

**Mit csinál ez:**
- `bind: "loopback"` – csak localhost
- `auth: token` – minden kapcsolat hitelesítve
- `dmScope: "per-channel-peer"` – DM-ek izolálva
- `tools.deny` – veszélyes eszközök tiltva
- `exec: deny` – shell parancsok tiltva
- `elevated: false` – host exec tiltva
- `dmPolicy: "pairing"` – DM-hez párosítás kell
- `requireMention: true` – csoportokban csak említésre reagál

### 3.2 Token generálása

```bash
openssl rand -hex 32
```

A kimenetet írd be a `gateway.auth.token` mezőbe.

### 3.3 Fájl jogosultságok

```bash
chmod 700 ~/.openclaw
chmod 600 ~/.openclaw/openclaw.json
```

### 3.4 mDNS kikapcsolása (információszivárgás ellen)

```json5
{
  discovery: {
    mdns: { mode: "minimal" },
  },
}
```

Vagy teljes kikapcsolás: `mode: "off"`.

### 3.5 Sandbox engedélyezése (Docker-ben)

Ha a host gateway Docker-ben fut, az agent sandbox külön Docker konténerben izolálja a tool futtatást:

```bash
scripts/sandbox-setup.sh
```

Konfiguráció:

```json5
{
  agents: {
    defaults: {
      sandbox: {
        mode: "non-main",
        scope: "agent",
        workspaceAccess: "none",
      },
    },
  },
}
```

---

## 4. Biztonsági audit futtatása

Rendszeresen futtasd:

```bash
openclaw security audit
openclaw security audit --deep
openclaw security audit --fix
```

A `--fix` javítja az automatikusan javítható dolgokat (pl. fájl jogosultságok).

---

## 5. Linux VPS-re költöztetés

### 5.1 Mi kell

- Linux VPS (pl. Hetzner, DigitalOcean, stb.) – Ubuntu/Debian ajánlott
- SSH hozzáférés
- Docker + Docker Compose a VPS-en

### 5.2 Költöztetés lépései

1. **Adatok mentése a jelenlegi gépről**
   - `~/.openclaw/` teljes mappája (config, credentials, sessions)
   - Biztonsági mentés: `tar -czvf openclaw-backup.tar.gz ~/.openclaw`

2. **VPS előkészítése**
   ```bash
   apt-get update
   apt-get install -y git curl ca-certificates
   curl -fsSL https://get.docker.com | sh
   ```

3. **OpenClaw klónozása a VPS-re**
   ```bash
   git clone https://github.com/openclaw/openclaw.git
   cd openclaw
   ```

4. **Persisztens könyvtárak**
   ```bash
   mkdir -p /root/.openclaw/workspace
   chown -R 1000:1000 /root/.openclaw
   ```

5. **`.env` a VPS-en**
   ```bash
   OPENCLAW_IMAGE=openclaw:latest
   OPENCLAW_GATEWAY_TOKEN=<erős-token-openssl-rand-hex-32>
   OPENCLAW_GATEWAY_BIND=loopback
   OPENCLAW_GATEWAY_PORT=18789
   OPENCLAW_CONFIG_DIR=/root/.openclaw
   OPENCLAW_WORKSPACE_DIR=/root/.openclaw/workspace
   GOG_KEYRING_PASSWORD=<jelszó>
   XDG_CONFIG_HOME=/home/node/.openclaw
   ```

6. **Backup visszaállítása**
   ```bash
   scp openclaw-backup.tar.gz root@VPS_IP:/root/
   ssh root@VPS_IP "cd /root && tar -xzvf openclaw-backup.tar.gz"
   ```

7. **Port binding – csak loopback**
   A `docker-compose.yml`-ban:
   ```yaml
   ports:
     - "127.0.0.1:18789:18789"
   ```

8. **SSH alagút a laptopról**
   ```bash
   ssh -N -L 18789:127.0.0.1:18789 root@VPS_IP
   ```

9. **Indítás**
   ```bash
   docker compose build
   docker compose up -d openclaw-gateway
   ```

10. **Hozzáférés**
    - Laptopról: `http://127.0.0.1:18789/` (SSH alagút miatt)

### 5.3 Biztonsági ellenőrzések VPS-en

- **Firewall:** csak SSH (22) legyen nyitva, 18789 ne legyen kint
- **Bind:** `gateway.bind: "loopback"` – ne legyen LAN/public
- **Auth:** token vagy jelszó mindig beállítva
- **Tailscale:** ha használod, ne használj Funnel-t (nyilvános expozíció)

---

## 6. Összefoglaló – biztonsági checklist

| Beállítás | Érték | Cél |
|-----------|-------|-----|
| `gateway.bind` | `loopback` | Csak localhost |
| `gateway.auth.mode` | `token` | Hitelesítés |
| `gateway.auth.token` | hosszú random | Erős token |
| `session.dmScope` | `per-channel-peer` | DM izoláció |
| `tools.deny` | automation, runtime, fs, stb. | Veszélyes eszközök tiltva |
| `tools.exec.security` | `deny` | Shell tiltva |
| `tools.elevated.enabled` | `false` | Host exec tiltva |
| `channels.*.dmPolicy` | `pairing` | DM párosítás |
| `channels.*.groups.*.requireMention` | `true` | Csoportokban említés |
| `discovery.mdns.mode` | `minimal` vagy `off` | mDNS minimalizálás |
| `~/.openclaw` jogosultság | `700` | Csak tulajdonos |
| `openclaw.json` jogosultság | `600` | Csak tulajdonos |
| Port binding (Docker) | `127.0.0.1:18789` | Csak localhost |

---

## 7. Hasznos parancsok

```bash
# Dashboard link
docker compose run --rm openclaw-cli dashboard --no-open

# Párosítás kezelése
docker compose run --rm openclaw-cli pairing list <channel>
docker compose run --rm openclaw-cli pairing approve <channel> <code>

# Health check
docker compose exec openclaw-gateway node dist/index.js health --token "$OPENCLAW_GATEWAY_TOKEN"

# ClawDock helper (opcionális)
mkdir -p ~/.clawdock
curl -sL https://raw.githubusercontent.com/openclaw/openclaw/main/scripts/shell-helpers/clawdock-helpers.sh -o ~/.clawdock/clawdock-helpers.sh
echo 'source ~/.clawdock/clawdock-helpers.sh' >> ~/.zshrc
```

---

## 8. További dokumentáció

- [Docker telepítés](https://docs.openclaw.ai/install/docker)
- [Biztonság](https://docs.openclaw.ai/gateway/security)
- [Hetzner / VPS útmutató](https://docs.openclaw.ai/install/hetzner)
- [Sandboxing](https://docs.openclaw.ai/gateway/sandboxing)
