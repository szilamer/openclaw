# OpenClaw natív telepítés saját Linux gépre

Útmutató a teljes folyamathoz: Linux telepítés → OpenClaw natív telepítés (Docker nélkül) → böngésző beállítás.

---

## 1. Linux disztribúció választása

| Opció | Cél | Ajánlás |
|-------|-----|---------|
| **Ubuntu Desktop** | Asztali GUI, böngésző látható | Legjobb választás |
| **Lubuntu** | Könnyebb, régebbi gépen | Ha kevés a RAM |
| **Ubuntu Server** | Headless (nincs GUI) | Ha nem kell látható böngésző |

**Ajánlott:** Ubuntu 24.04 LTS Desktop vagy Lubuntu – asztali környezet kell a headed böngészőhöz.

---

## 2. Linux telepítés

### 2.1 Ubuntu letöltés

1. Menj a [ubuntu.com/download/desktop](https://ubuntu.com/download/desktop) oldalra
2. Töltsd le az Ubuntu 24.04 LTS ISO-t
3. Készíts bootolható USB-t (Rufus, Balena Etcher, vagy `dd`)

### 2.2 Telepítés

1. Boot a USB-ról
2. Válaszd: „Install Ubuntu”
3. Minimális telepítés elég (ha csak OpenClaw-t futtatod)
4. Hozz létre egy felhasználót (pl. `openclaw`)
5. Válaszd: „Install third-party software” (driverek)

### 2.3 Első bejelentkezés után

```bash
sudo apt update && sudo apt upgrade -y
```

---

## 3. OpenClaw natív telepítés

### 3.1 Node.js 22+

```bash
# NodeSource repo
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs

# Ellenőrzés
node --version   # v22.x.x
npm --version
```

### 3.2 OpenClaw telepítés (install script)

```bash
curl -fsSL https://openclaw.ai/install.sh | bash
```

Ez telepíti:
- Node 22+ (ha hiányzik)
- OpenClaw-t (npm vagy git)
- Futtatja az onboard wizard-t

### 3.3 Alternatíva: git clone (ha a repót szeretnéd)

```bash
git clone https://github.com/openclaw/openclaw.git ~/openclaw
cd ~/openclaw
corepack enable && corepack prepare pnpm@latest --activate
pnpm install && pnpm build

# Wrapper a PATH-ba
mkdir -p ~/.local/bin
ln -sf ~/openclaw/openclaw.mjs ~/.local/bin/openclaw
echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.bashrc
source ~/.bashrc
```

### 3.4 Onboard wizard

```bash
openclaw onboard --install-daemon
```

A wizard:
- Bekéri a gateway tokent
- Beállítja a portot (18789)
- Opcionálisan telepíti a systemd szolgáltatást

---

## 4. Böngésző beállítás (headed, látható)

### 4.1 Chromium / Chrome telepítés

Ubuntun a snap Chromium problémás lehet. Jobb a Google Chrome:

```bash
wget https://dl.google.com/linux/direct/google-chrome-stable_current_amd64.deb
sudo dpkg -i google-chrome-stable_current_amd64.deb
sudo apt --fix-broken install -y
```

Vagy Chromium (apt, nem snap):

```bash
sudo apt install -y chromium-browser
# Ha snap-et próbál: sudo apt install chromium-browser  # régebbi Ubuntu
```

### 4.2 openclaw.json böngésző konfig

Szerkeszd: `~/.openclaw/openclaw.json`

```json
{
  "browser": {
    "enabled": true,
    "headless": false,
    "noSandbox": true,
    "executablePath": "/usr/bin/google-chrome-stable"
  }
}
```

Ha Chromium-t használsz, és nem snap:

```json
"executablePath": "/usr/bin/chromium-browser"
```

### 4.3 DISPLAY (ha headless módban fut a gateway)

Ha a gateway systemd szolgáltatásként fut, és nincs bejelentkezve a felhasználó, a `DISPLAY` lehet üres. Asztali környezetben (bejelentkezve) a `DISPLAY=:0` vagy `:1` automatikusan beállítódik.

Ha systemd user service-t használsz, és van bejelentkezve a felhasználó, a DISPLAY általában rendben van.

---

## 5. Szolgáltatás (systemd) – opcionális

Ha a gateway automatikusan induljon és újrainduljon:

```bash
openclaw onboard --install-daemon
```

Vagy manuálisan:

```bash
openclaw gateway install
```

Ellenőrzés:

```bash
systemctl --user status openclaw-gateway.service
systemctl --user enable --now openclaw-gateway.service
```

### systemd linger (fontos headless szerveren)

Ha a gépet nem használod bejelentkezve (pl. SSH-n), a user service-ek nem indulnak. Engedélyezd a linger-t:

```bash
sudo loginctl enable-linger $USER
```

---

## 6. Ellenőrzés

```bash
# Gateway fut?
openclaw gateway status

# Control UI
openclaw dashboard
# vagy: http://127.0.0.1:18789/

# Böngésző
openclaw browser --browser-profile openclaw status
openclaw browser --browser-profile openclaw start
```

---

## 7. Távoli elérés (laptopról)

Ha a Linux gép otthoni szerver, és a laptopról szeretnéd elérni:

```bash
# SSH tunnel
ssh -N -L 18789:127.0.0.1:18789 felhasznalo@linux-gep-ip

# Majd böngészőben: http://127.0.0.1:18789/
```

Vagy Tailscale: [docs.openclaw.ai/gateway/remote](https://docs.openclaw.ai/gateway/remote)

---

## 8. Gyors összefoglaló

| Lépés | Parancs |
|-------|---------|
| 1. Linux | Ubuntu 24.04 Desktop telepítés |
| 2. Node | `curl -fsSL https://deb.nodesource.com/setup_22.x \| sudo -E bash -` && `sudo apt install -y nodejs` |
| 3. OpenClaw | `curl -fsSL https://openclaw.ai/install.sh \| bash` |
| 4. Onboard | `openclaw onboard --install-daemon` |
| 5. Chrome | `wget ... && sudo dpkg -i google-chrome-stable_current_amd64.deb` |
| 6. Config | `~/.openclaw/openclaw.json` → `browser.headless: false`, `executablePath` |
| 7. Dashboard | `openclaw dashboard` vagy `http://127.0.0.1:18789/` |

---

## 9. Hibaelhárítás

### Böngésző nem indul

- Snap Chromium: használj Google Chrome vagy apt Chromium-ot
- `browser.noSandbox: true` – Linux-on gyakran szükséges
- [Browser troubleshooting](https://docs.openclaw.ai/tools/browser-linux-troubleshooting)

### openclaw command not found

```bash
echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.bashrc
source ~/.bashrc
```

### Gateway nem indul

```bash
journalctl --user -u openclaw-gateway.service -n 50
openclaw doctor
```
