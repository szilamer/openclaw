# Mi történik – lépésről lépésre

## A probléma

A `docker compose pull` után **nem mindig ír ki semmit** a letöltés alatt (vagy csak a WARN-ok látszanak). A letöltés **2–5 perc** is lehet (~4 GB image), és közben úgy tűnhet, hogy „nem csinál semmit”.

---

## Mit csinálj (a Mac **Terminal.app**-ban)

### A. Egyszerre minden: script

```bash
cd /Users/feherszilamer/Projects/OpenClaw/repo
chmod +x inditas-egyszeru.sh
./inditas-egyszeru.sh
```

A script:
1. Megnézi, fut-e a Docker
2. Letölti az image-et (ekkor látszani fognak a rétegek)
3. Elindítja a gateway konténert
4. Kiírja az állapotot

---

### B. Kézzel, egy parancs egyszerre

**1. Docker fut?**

```bash
docker info
```

Ha ezt hibával zárja, indítsd el a **Docker Desktop**ot és várj, amíg teljesen feláll.

**2. Image letöltése** (várj a végéig!)

```bash
cd /Users/feherszilamer/Projects/OpenClaw/repo
docker compose pull openclaw-gateway
```

- A WARN üzeneteket figyelmen kívül hagyhatod.
- Ha a hálózat lassú, sokáig lehet „üres”, majd megjelennek a rétegek (Layer already exists / Pull complete).
- Ha **sikerült**, a végén lesz valami „Downloaded newer image” vagy „Image is up to date”.

**3. Konténer indítása**

```bash
docker compose up -d openclaw-gateway
```

Sikeres indításnál pl.:

```
[+] Running 2/2
 ✔ Container repo-openclaw-gateway-1  Started
```

**4. Megnézni, fut-e**

```bash
docker compose ps
```

Itt meg kell jelennie egy **running** konténernek.

**5. Böngészőben**

Nyisd meg: **http://127.0.0.1:18789/**  
Token: `6f523e3a539b14de6f5530f8af498400c70d28fcb3839982b86853e79931d4d1` (Settings → token).

---

## Ha még mindig „nem történik semmi”

- **Docker Desktop:** legyen nyitva és **Running** (zöld pipa). Ha nem, indítsd újra.
- **Image létezik?** Futtasd:  
  `docker images | grep openclaw`  
  Ha nincs sor, a pull nem fejeződött be vagy elakadt. Futtasd újra:  
  `docker compose pull openclaw-gateway`  
  és várj 3–5 percet.
- **Hibaüzenet:** ha a `docker compose up -d openclaw-gateway` valamilyen hibát ír ki, másold be a teljes kimenetét, és azt tudjuk kideríteni, mi a gond.
