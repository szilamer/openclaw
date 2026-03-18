# Docker nem válaszol – mi a gond és mit csinálj

Ha a `docker info` vagy bármelyik `docker` parancs „csüng” és semmi kimenet, általában a **Docker Desktop** vagy a háttérben futó **Docker daemon** nincs rendben.

---

## 1. Docker Desktop teljesen leállítása és újraindítás

1. **Quit (kilépés), nem csak bezárás:**
   - Kattints a menüsorban a **Docker ikonra** (bálna).
   - Válaszd: **Quit Docker Desktop**.
   - Várj 5–10 másodpercet.

2. **Újraindítás:**
   - Nyisd meg újra a **Docker Desktop**ot (Spotlight: Cmd+Space → „Docker”).
   - Várj, amíg **teljesen feláll**: alsó sáv „Engine running” / zöld pipa. Ez akár 1–2 perc is lehet.

3. **Teszt a terminálban:**
   ```bash
   docker info
   ```
   Ha 2–3 másodpercen belül ír ki sok sort, a Docker már válaszol.

---

## 2. Ha még mindig nem válaszol

### A. Docker Desktop beállítások

- **Docker Desktop → Settings (fogaskerék) → General**
  - **“Use the WSL 2 based engine”** – ha van ilyen, Macen nincs, hagyd.
  - **“Start Docker Desktop when you sign in”** – tetszés szerint.
- **Resources** – ne legyen túl alacsony a memória (pl. 2 GB minimum).
- **Apply & Restart**, majd várj, amíg újra „Engine running”.

### B. Újraindítás után is csüng a `docker info`

Lehet, hogy a daemon nem indul el vagy összeakadt:

1. **Docker Desktop** teljes **Quit**.
2. Terminálban (nem feltétlenül szükséges, de segít):
   ```bash
   killall Docker 2>/dev/null
   killall com.docker.hyperkit 2>/dev/null
   killall com.docker.backend 2>/dev/null
   ```
   Várj 5 mp-et.
3. Indítsd újra a **Docker Desktop**ot és várj 1–2 percet.
4. Próbáld újra: `docker info`.

### C. Telepítés / verzió

- **Docker Desktop** legyen a legfrissebb: [https://www.docker.com/products/docker-desktop/](https://www.docker.com/products/docker-desktop/)
- Mac: **Apple Silicon (M1/M2/M3)** vagy **Intel** – a megfelelő verziót töltsd le.
- Ha régi a verzió: frissíts, vagy távolítsd el és telepítsd újra a Docker Desktopot.

---

## 3. Ha semmi sem segít – Docker nélküli OpenClaw

Ha a Docker továbbra sem válaszol és nem akarsz vele foglalkozni, az OpenClaw **Docker nélkül** is futtatható (közvetlenül a gépen):

1. **Node.js** kell (18+ vagy 22): [https://nodejs.org](https://nodejs.org)
2. Terminálban:
   ```bash
   npm install -g openclaw@latest
   openclaw onboard --install-daemon
   ```
3. A varázsló végigvezet a beállításon; a gateway ezután a gépen fut (nem konténerben).

---

## Rövid ellenőrzőlista

| Lépés | Mit csinálj |
|-------|------------------|
| 1 | Docker Desktop **Quit**, majd újraindítás, várj „Engine running”-ra. |
| 2 | Terminál: `docker info` – 2–3 mp alatt válaszol? |
| 3 | Ha nem: Settings → Resources oké? → Apply & Restart. |
| 4 | Ha még mindig nem: Docker Desktop frissítés / újratelepítés. |
| 5 | Ha a Dockert nem sikerül rendbe hozni: OpenClaw Node-tal, `npm install -g openclaw` + `openclaw onboard`. |

Ha leírod, hogy a `docker info` konkrétan mit csinál (azonnal visszatér, vagy percekig vár, vagy hibát ír), tudunk még pontosabban lépni.
