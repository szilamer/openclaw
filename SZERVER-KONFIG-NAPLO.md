# OpenClaw Szerver Konfigurációs Napló

> Összefoglaló emlékeztető az AI asszisztens (Cursor) számára a Sophon/OpenClaw szerver kezeléséhez.
> Utoljára frissítve: 2026-02-22

---

## 1. Rendszer áttekintés

### Infrastruktúra
- **VPS:** Hetzner, IP: `23.88.58.202`, root hozzáférés SSH-n
- **OpenClaw** Docker containerben fut: `docker ps` → container neve: `openclaw`
- **Böngésző container** (ha szükséges): `openclaw-browser`
- **Időzóna:** `Europe/Budapest`

### Belépés a szerverre
```bash
ssh root@23.88.58.202
```

### OpenClaw container shell
```bash
docker exec -it openclaw sh
```

### Fontos könyvtárak a VPS-en

| Útvonal (host) | Útvonal (container) | Mit tartalmaz |
|---|---|---|
| `/root/.openclaw/` | `/home/node/.openclaw/` | Teljes OpenClaw adat könyvtár |
| `/root/.openclaw/workspace/` | `/home/node/.openclaw/workspace/` | Agent workspace fájlok |
| `/root/.openclaw/cron/jobs.json` | `/home/node/.openclaw/cron/jobs.json` | Cron job definíciók |
| `/root/.openclaw/openclaw.json` | `/home/node/.openclaw/openclaw.json` | Fő konfiguráció |
| `/root/.openclaw/sessions/` | — | Session history JSONL fájlok |

### Workspace fájlok (agent kontextus)
Ezek **minden turnnél be vannak injektálva** a system promptba — ez a legfontosabb tudnivaló:

| Fájl | Szerepe |
|---|---|
| `SOUL.md` | Agent identitás, viselkedési elvek, aktív feladatkörök |
| `MEMORY.md` | Hosszú távú memória: Trello ID-k, projekt index, rendszer adatok |
| `AGENTS.md` | Rövid operatív szabályok (browser, cron, Trello) |
| `TOOLS.md` | Eszközök részletes leírása (email, browser, Trello API, cron) |
| `secrets.md` | Belépési adatok (gitignored) |
| `memory/projects/PROJEKTNEV.md` | Projekt-specifikus tudásbázis fájlok |
| `memory/last_processed_email_id.txt` | Utolsó feldolgozott email IMAP UID |

---

## 2. Hogyan dolgozom a szerverrel

### Fájl deployment workflow

**MINDIG így deployálok** — soha ne szerkesszük a fájlokat közvetlenül SSH-n keresztül (heredoc problémák, escape karakterek):

```bash
# 1. Helyi temp fájl írása (Write tool / echo > /tmp/...)
# 2. SCP a VPS-re
scp /tmp/FAJLNEV.md root@23.88.58.202:/root/.openclaw/workspace/FAJLNEV.md

# 3. Ellenőrzés
ssh root@23.88.58.202 "wc -l /root/.openclaw/workspace/FAJLNEV.md"

# 4. OpenClaw újraindítás (ha konfig változott)
ssh root@23.88.58.202 "docker restart openclaw"
```

### Cron jobok módosítása

A `jobs.json`-t **teljes fájlként kell felülírni** — nincs API az egyedi módosításhoz:

```bash
# Helyi /tmp/cron_jobs.json szerkesztése, majd:
scp /tmp/cron_jobs.json root@23.88.58.202:/root/.openclaw/cron/jobs.json
ssh root@23.88.58.202 "docker restart openclaw"

# Ellenőrzés:
ssh root@23.88.58.202 "docker exec openclaw cat /home/node/.openclaw/cron/jobs.json"
```

### Container belső script telepítés (perzisztens)

A container `/usr/local/bin/` könyvtára **NEM perzisztens** — restart után elveszik. A megoldás: bind mount.

```bash
# 1. Script mentése a perzisztens könyvtárba
mkdir -p /root/.openclaw/scripts
cp /tmp/script.sh /root/.openclaw/scripts/scriptname
chmod +x /root/.openclaw/scripts/scriptname

# 2. Container újraindítása extra mount-tal
docker stop openclaw && docker rm openclaw
docker run -d --name openclaw --restart unless-stopped \
  ... (többi mount) ...
  -v /root/.openclaw/scripts/scriptname:/usr/local/bin/scriptname \
  openclaw-with-browser
```

**Teljes start script:** `/root/start-openclaw.sh` — ez tartalmazza a helyes docker run parancsot az összes mount-tal.

A `trello-api` script helye: `/root/.openclaw/scripts/trello-api` (host) → `/usr/local/bin/trello-api` (container)

### Trello API közvetlen hívás (Cursorból/lokálisan)

> **Biztonság:** A KEY és TOKEN csak a VPS `secrets.md`-ben legyen. Soha ne commitold!

```bash
# A tényleges értékek: /root/.openclaw/workspace/secrets.md
KEY="$TRELLO_KEY"   # vagy: cat secrets.md | grep TRELLO_KEY
TOKEN="$TRELLO_TOKEN"
curl -s "https://api.trello.com/1/ENDPOINT?key=${KEY}&token=${TOKEN}"
```

---

## 3. OpenClaw konfiguráció (`openclaw.json`) — kulcs beállítások

```jsonc
{
  "agents": {
    "defaults": {
      "bootstrapMaxChars": 50000,       // egy workspace fájl max mérete
      "bootstrapTotalMaxChars": 150000, // összes workspace fájl együtt — KRITIKUS LIMIT
      "heartbeat": {
        "every": "0m"                   // 0m = kikapcsolva (nem ez a megoldás a context freshness-re)
      }
    }
  },
  "session": {
    "reset": {
      "mode": "daily",    // napi automatikus session reset
      "atHour": 4,        // hajnali 4-kor
      "idleMinutes": 240  // VAGY 4 óra inaktivitás után
    }
  }
}
```

---

## 4. Cron job struktúra — kötelező formátum

**Kétféle job létezik, TILOS keverni:**

### Emlékeztető (a fő chatbe)
```json
{
  "sessionTarget": "main",
  "payload": { "kind": "systemEvent", "text": "Szöveges emlékeztető" }
}
```

### Önálló feladat (izolált session, Telegram értesítéssel)
```json
{
  "sessionTarget": "isolated",
  "wakeMode": "now",
  "payload": {
    "kind": "agentTurn",
    "message": "Részletes feladatleírás...",
    "timeoutSeconds": 300
  },
  "delivery": { "mode": "announce", "channel": "telegram" }
}
```

### Schedule formátumok
```json
{ "kind": "every", "everyMs": 3600000, "anchorMs": 1740232800000 }  // óránként
{ "kind": "cron", "expr": "0 7 * * *", "tz": "Europe/Budapest" }    // napi 7:00
```

---

## 5. Ismert problémák és megoldások

### P1: Agent "elfelejti" a kontextusát / nem találja az eszközöket

**Tünet:** Agent nem tudja ki ő, nem találja a `trello-api` scriptet, nem ismeri a workflow-t.

**Gyökér ok:** A workspace fájlok (`SOUL.md`, `AGENTS.md`, `TOOLS.md`, `MEMORY.md`) összesített mérete **meghaladja a `bootstrapTotalMaxChars` limitet (~150 000 karakter)**. A túlnyúló tartalom levágódik, ezért az agent nem kapja meg a teljes kontextust.

**Megoldás:**
1. Minden workspace fájlt tömörre kell tartani — max 50-80 sor fájlonként
2. `AGENTS.md` ne tartalmazzon részleteket — csak elveket és referenciákat
3. Részletek mindig `TOOLS.md`-ben legyenek (az is csak egyszer legyen leírva)
4. Ne legyen redundáns ismétlés a fájlok között

**Ellenőrzés:**
```bash
ssh root@23.88.58.202 "wc -c /root/.openclaw/workspace/*.md"
# Az összes .md fájl együtt ne haladja meg ~100 000 karaktert (biztonsági sáv)
```

---

### P2: Trello API "invalid key" hiba

**Tünet:** `trello-api GET /boards/ID/cards?fields=name,...` → "invalid key" válasz.

**Gyökér ok:** A `trello-api` script úgy fűzi hozzá a credentials-t: `ENDPOINT?key=KEY`. Ha az ENDPOINT már tartalmaz `?`-t (pl. `?fields=...`), a URL dupla kérdőjeles lesz (`...?fields=name?key=KEY`) → érvénytelen URL → Trello "invalid key"-t küld vissza.

**Megoldás:** A script ellenőrzi, tartalmaz-e már `?`-t az endpoint:
```bash
if echo "$ENDPOINT" | grep -q "?"; then
  CREDS="&key=${KEY}&token=${TOKEN}"   # & ha már van ?
else
  CREDS="?key=${KEY}&token=${TOKEN}"   # ? ha még nincs
fi
```

A javított script: `/root/.openclaw/scripts/trello-api` (perzisztens, bind mount-olva a containerbe).

### P2b: Container belső fájlok elvesznek restart után

**Tünet:** `trello-api` script nincs a containerben restart után.

**Gyökér ok:** A container `/usr/local/bin/` nem perzisztens volume, restart után üres.

**Megoldás:** A scriptet a `/root/.openclaw/scripts/` könyvtárba mentjük (ez perzisztens volume), és bind mount-tal kötjük be a `/usr/local/bin/trello-api`-ra. Részletek a "Container belső script telepítés" szekcióban.

### P2c: Fájl permission hiba workspace-ben

**Tünet:** `[tools] write failed: EACCES: permission denied` — agent nem tudja írni a `memory/last_processed_email_id.txt` fájlt.

**Gyökér ok:** Az SSH root session-ből létrehozott fájl `root:root` tulajdonú, de a container `node` (uid=1000) userként fut.

**Megoldás:**
```bash
chown 1000:1000 /root/.openclaw/workspace/memory/last_processed_email_id.txt
```

**Általános szabály:** Minden workspace fájlt a VPS-en `chown 1000:1000`-rel kell létrehozni/másolni, ha az agent-nek írnia kell. Az `scp`-vel feltöltött fájlok automatikusan root tulajdonúak lesznek — utána chown kell!

---

### P3: Browser "Can't reach the browser control service" hiba

**Tünet:** Minden browser hívás ezt az üzenetet adja, az agent feladja.

**Gyökér ok:** A hiba üzenet **félrevezető** — a valódi hiba a zárójelben van:
- `(Element "eXX" not found)` → a snapshot elavult, új kell
- `(fields are required)` → hiányzó paraméter
- `(browser control disabled)` → valódi hiba

**Megoldás:** `AGENTS.md` és `TOOLS.md`-ben explicit instrukció a helyes sorrendről: `navigate → snapshot → fill/click`.

---

### P4: Google 2FA böngészőn keresztül nem működik

**Tünet:** Trello Google OAuth bejelentkezésnél 500 hibák az SMS kód bevitele után.

**Gyökér ok:** Google felismeri az automatizált/headless böngészőt.

**Megoldás:** Trello REST API használata böngésző helyett. API Key + Token generálás: https://trello.com/power-ups/admin

---

### P5: SSH heredoc problémák

**Tünet:** `ssh root@... "cat > /file << EOF ... EOF"` nem működik, a fájl tartalom hibás vagy csonkított.

**Gyökér ok:** A shell escape karakterek összeakadnak az SSH-n keresztüli heredoc-kal.

**Megoldás:** Mindig helyi temp fájl írása + `scp` feltöltés. Soha ne próbálj komplex fájlt SSH heredoc-kal írni.

---

### P6: Cron job nem fut / rossz session-be megy

**Tünet:** Cron job tüzelt, de nem történt semmi, vagy a fő chatbe kerültek a válaszok.

**Gyökér ok:** `sessionTarget` és `payload.kind` nem kompatibilis kombináció.

**Megoldás:** Lásd a "4. Cron job struktúra" fejezetet — a két típust tilos keverni.

---

## 6. Trello workspace — ID referencia

### Feladatok tábla (`699c904a72d6f485a5fd25d7`)

| Lista | ID |
|---|---|
| Teendő | `699c904ad4028ee62288135c` |
| Folyamatban | `699c904aa1816e2e93296488` |
| 📧 Email vázlat | `699d245a0191164fcb231f05` |
| Felülvizsgálat | `699c904bedd8ebcfb878004d` |
| Kész | `699c904c8a572c707b805e42` |

### Projektek tábla (`699c904c767b47cd50dfccfc`)

| Lista | ID |
|---|---|
| Aktív | `699c904dd16c628e6ecf3f9a` |
| Szüneteltetett | `699c904d7384ebe9c98d3379` |
| Befejezett | `699c904da9694f368d25c4e0` |

### Ötletek & Backlog tábla (`699c904e56f1b14fc5c88546`)

| Lista | ID |
|---|---|
| Beérkező | `699c904ef9d3f2e2d63dcb9d` |
| Értékelés alatt | `699c904f3af883d19746edde` |
| Elfogadva | `699c904f683ad63226181dbc` |

### Labelek (Feladatok tábla)

| Label | ID | Szín |
|---|---|---|
| 🤖 Sophon feladata | `699d28666b1d7ce3339b203a` | Kék/ég |
| 👤 Szilamér | `699d2867663f9b0bc96166d1` | Kék |
| ⏳ Várakozás | `699d2867cbb25ccd7bf5c0d0` | Sárga |
| 📧 Email válasz | `699d245b1a77df7dcee155ec` | Piros |

---

## 7. Aktív cron jobok

| ID | Neve | Frekvencia | Típus |
|---|---|---|---|
| `email-hourly-processor` | Óránkénti email feldolgozás | 1 óránként | isolated/agentTurn |
| `trello-manager` | Trello 2 órás feladatkezelés | 2 óránként | isolated/agentTurn |

### Email cron feladatai (sorrendben)
1. Jóváhagyott email válaszok küldése (Kész listából)
2. Új emailek azonosítása (last_processed_email_id.txt alapján)
3. Projekt egyezés → `memory/projects/` frissítése
4. Feladat detektálás → Trello kártya
5. Válasz szükséges? → "📧 Email vázlat" lista kártya
6. Telegram összefoglaló (csak ha volt érdemi esemény)

### Trello cron feladatai (sorrendben)
1. Snapshot: lejárt/közelgő határidők → Telegram + kártyán komment
2. 🤖 Sophon feladatok elvégzése (Teendő + Folyamatban lista)
3. Delegált feladatok (👤 Szilamér, ⏳ Várakozás) — 3+ napos pangásnál emlékeztető
4. Projekt tábla — 14+ napos inaktivitásnál státusz kérdés
5. Telegram összefoglaló (csak ha volt akció)

---

## 8. Credentials összefoglaló

> Részletes, teljes credentials: VPS `/root/.openclaw/workspace/secrets.md`

| Szolgáltatás | Hol |
|---|---|
| Trello API Key + Token | `secrets.md` + hardcode-olva: `/usr/local/bin/trello-api` |
| Gmail (szilamerai@gmail.com) | `send-email` script + himalaya IMAP konfig |
| Billingo | `secrets.md` (browser-alapú) |
| Telegram bot | OpenClaw belső konfig (`openclaw.json`) |

---

## 9. Szokásos feladatok gyors parancslista

```bash
# OpenClaw újraindítás (egyszerű restart, NEM veszíti el a mountokat)
ssh root@23.88.58.202 "docker restart openclaw"

# OpenClaw teljes újraindítás (container törlés + újralétrehozás, pl. új mount hozzáadásakor)
ssh root@23.88.58.202 "bash /root/start-openclaw.sh"

# Logs
ssh root@23.88.58.202 "docker logs openclaw --tail 50"

# Cron jobok ellenőrzése
ssh root@23.88.58.202 "docker exec openclaw cat /home/node/.openclaw/cron/jobs.json"

# trello-api script megléte
ssh root@23.88.58.202 "docker exec openclaw which trello-api && docker exec openclaw trello-api GET /members/me | python3 -c 'import json,sys; d=json.load(sys.stdin); print(d.get(\"username\",\"ERR\"))'"

# Workspace fájlok mérete (context limit ellenőrzés)
ssh root@23.88.58.202 "wc -c /root/.openclaw/workspace/*.md | sort -n"

# Trello - Sophon táblák listázása (KEY + TOKEN: secrets.md)
KEY="${TRELLO_KEY:-}"; TOKEN="${TRELLO_TOKEN:-}"
curl -s "https://api.trello.com/1/organizations/sophon29/boards?key=${KEY}&token=${TOKEN}" | python3 -c "import json,sys; [print(f'{b[\"id\"]} {b[\"name\"]}') for b in json.load(sys.stdin)]"

# OpenClaw session reset (ha az agent elveszett)
ssh root@23.88.58.202 "docker restart openclaw"
```
