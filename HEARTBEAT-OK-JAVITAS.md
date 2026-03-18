# "heartbeat ok" – csak ezt mondja a bot

Ha bármit írsz, és mindig csak **heartbeat ok** a válasz, a modellhívás valószínűleg hibázik (üres/hiba válasz), és a rendszer ezt írja ki.

---

## 1. Base URL javítása (404 miatt)

A Config → Raw-ban az OpenAI provider **baseUrl** legyen **pontosan**:

```text
"baseUrl": "https://api.openai.com/v1"
```

Ne legyen csak `https://api.openai.com` (hiányzó `/v1` → 404).  
Mentsd, **Apply**, majd próbáld újra a chatet.

---

## 2. Konténer újraindítása

A config változás néha csak újraindítás után lép életbe:

```bash
docker restart openclaw
```

Vagy:

```bash
docker stop openclaw && docker start openclaw
```

Ezután nyisd meg újra a Control UI-t és írj a chatbe.

---

## 3. Debug: látszik-e a modell?

- Control UI → **Debug** fül.
- Nézd meg: **Models** / **Health** – látszik-e az **openai** provider, és **ok** a státusz?
- Ha **error** vagy **no API key** van, a kulcs vagy a baseUrl még mindig rossz/hiányzik.

---

## 4. Agent modell beállítás

- **Agents** fül → válaszd az agentet (pl. **main**).
- **Overview** (vagy Model) részen legyen beállítva: **openai/gpt-4o-mini** (vagy más OpenAI modell).
- Ha más provider van (pl. anthropic) és nincs hozzá kulcs, azt is „heartbeat ok”-ra lehet lecserélni a hiba miatt.

---

## 5. Összefoglalva

1. **baseUrl** = `https://api.openai.com/v1`  
2. **Save** + **Apply**  
3. **docker restart openclaw**  
4. **Debug** fülön ellenőrizni, hogy openai ok  
5. **Agents** → main → modell = **openai/gpt-4o-mini**

Ha ezután is csak „heartbeat ok” jön, a **Debug** fülön vagy a **Config → Reload** után a hibaüzeneteket érdemes megnézni (pl. 404, 401, no API key).

---

## 6. Ha az API rendben van, de a modell még mindig „HEARTBEAT_OK”-ot ír

Ha a session logban a válasz **nem** 404/üres, hanem a modell szó szerint **HEARTBEAT_OK** (7 token) – a rendszerprompt korábban minden futtatáshoz hozzáadta a „heartbeat poll → válaszolj HEARTBEAT_OK” részt, és a modell ezt normál csevegésre is alkalmazta.

**Javítás a kódban (ajánlott):** A Heartbeats szekció most **csak tényleges heartbeat futásnál** kerül a system promptba. Normál csevegés (Control UI, gateway, CLI) nem kapja meg, így a modell nem válaszol csak HEARTBEAT_OK-kal. **Nincs szükség config változtatásra.**

Ha régebbi buildet futtatsz és továbbra is csak HEARTBEAT_OK jön: a Config → Raw-ban az `agents.defaults` alá opcionálisan beállíthatod az **extraSystemPrompt** mezőt (pl. „Messages from the Control UI are normal chat…”), és a gateway összevonja a kéréssel – de a tiszta megoldás a fenti kódbelüli változtatás.
