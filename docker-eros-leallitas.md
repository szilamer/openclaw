# Docker erővel leállítása (ha nem jön ki, nincs ikon)

Ha a Docker Desktop ablakát bezárod, de nem tudod „Quit”-tal kikapcsolni, és a menüsorban nincs Docker ikon, a program valószínűleg beragadt. Így állítsd le erővel.

---

## 1. Erőltetett kiléptetés Terminálból

Nyisd meg a **Terminal.app**-ot, másold be egyesével (Enter minden után), és várj pár másodpercet:

```bash
pkill -9 Docker
```

```bash
pkill -9 "Docker Desktop"
```

```bash
pkill -9 com.docker.backend
```

```bash
pkill -9 com.docker.hyperkit
```

```bash
pkill -9 com.docker.vmnetd
```

Ezután várj **10–15 másodpercet**. A Dockernak és a háttérfolyamatoknak ennyi idő kell a leálláshoz.

---

## 2. Ha még mindig fut valami – Tevékenységfigyelő

1. Nyomd meg: **Cmd+Space** (Spotlight), írd be: **Tevékenységfigyelő** (vagy **Activity Monitor**), Enter.
2. A keresőmezőbe írd be: **Docker**.
3. Jelöld ki az összes **Docker**-rel kezdődő folyamatot (Docker, Docker Desktop, com.docker.…), majd kattints a **X** ikonra (bal felső) → **Kilépés kényszerítése** / **Force Quit**.

Várj újra 10 másodpercet.

---

## 3. Újraindítás

1. **Cmd+Space** → írd be: **Docker**.
2. Nyomj **Enter** – el kell indulnia a **Docker Desktop**nak.
3. Várj **1–2 percet**, amíg feláll (akár üres ablak, vagy „Starting…”).
4. A menüsorban (jobb felső) előbb-utóbb meg kell jelennie a **Docker (bálna) ikonnak**. Ha rákattintasz, látod, hogy „Engine running” vagy még „Starting…”.

---

## 4. Ellenőrzés

Terminálban:

```bash
docker info
```

Ha **2–3 másodpercen belül** sok sor kijön (nem „csüng” a parancs), a Docker már rendben fut.

---

## 5. Ha így sem indul el rendesen

- **Újraindítsd a Macet**, majd csak utána indítsd el a Docker Desktopot.
- Ha továbbra sem stabil: **Docker Desktop eltávolítása** (a programot a Lomtárba húzva), majd **újratelepítés** a [docker.com](https://www.docker.com/products/docker-desktop/) oldalról.
