# Eszköz (böngésző) jóváhagyása – "pairing required" esetén

Ha a Control UI „pairing required” üzenetet mutat, a böngészőt egyszer jóvá kell hagyni. Két lehetőség van.

---

## 1. Jóváhagyás parancsokkal (Dockerben fut a gateway)

A gateway a **openclaw** konténerben fut, ezért a parancsokat a konténerben kell futtatni.

**1. Függőben lévő kérések listázása:**

```bash
docker exec openclaw node openclaw.mjs devices list
```

A kimenetben lesz egy **pending** (függő) kérés, pl. `requestId: "abc123..."`.

**2. Jóváhagyás a requestId-val:**

```bash
docker exec openclaw node openclaw.mjs devices approve <requestId>
```

Cseréld ki a `<requestId>`-t a listából látott értékre, pl.:

```bash
docker exec openclaw node openclaw.mjs devices approve abc123xyz
```

**3. A böngészőben** kattints újra a **Connect** gombra (vagy frissítsd az oldalt és add meg a tokent). Ezután már be kell lépnie.

---

## 2. Jóváhagyás a Control UI-ból (ha már be vagy lépve)

Ha **már van** egy jóváhagyott eszköz (pl. másik böngésző vagy már korábban bementél):

1. Nyisd meg a Control UI-t azzal az eszközzel, ami már párosítva van.
2. Menj a **Nodes** / **Devices** (Eszközök) menüpontra.
3. A **Pending** (Függőben lévő) listában megjelenik az új böngésző.
4. Kattints a **Approve** (Jóváhagyás) gombra a kívánt kérés mellett.

Utána az új böngészőből is be tudsz lépni.

---

## 3. Pairing kikapcsolva (csak helyi használatra)

Ha csak te használod helyben és nem akarsz párosítással foglalkozni, a pairing kikapcsolható (ezt már használtuk):

```bash
cd /Users/feherszilamer/Projects/OpenClaw
bash pairing-kikapcsolva.sh
```

Ezután a token elegendő, nem kell eszközt jóváhagyni.

---

## Összefoglalva

| Helyzet | Teendő |
|--------|--------|
| „pairing required” + Docker | `docker exec openclaw node openclaw.mjs devices list` → majd `devices approve <requestId>` |
| „pairing required” + már be vagy lépve máshonnan | Control UI → Nodes/Devices → Pending → Approve |
| Nem akarsz párosítást | `bash pairing-kikapcsolva.sh` (csak helyi 127.0.0.1) |
