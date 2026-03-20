# Email triage — célarchitektúra (2 cron, minimális script)

**Megvalósítva (backend + szkriptek):** `awaiting_sophon` státusz, Stage 1-only `register`, `PATCH` `sophon_resolve`, `getTriageContext.awaitingSophonQueue`, `skills/imap-smtp-email/scripts/email-triage-stage1-hourly.sh` + `register-stage1-from-json.mjs`, Sophon instrukció: `config/agents/email-triage-stage2-sophon.md`.

**Neked beállítandó:** OpenClaw `jobs.json` — (1) óránként a Stage 1 script, **telegram/delivery kikapcsolva**; (2) 3 óránként `agentTurn` + `openai-codex/gpt-5.3-codex` + Stage 2 instrukció.

## Elv

- **Ne szétszórjuk** a logikát sok külön „extra” scriptre: ideálisan **két egyértelmű belépési pont** (órai + 3 óránkénti), mindkettő ugyanarra a pipeline-ra épül (IMAP → sor → döntés → task vagy ember).
- **Emberi döntés** csak akkor kell, ha a **Sophon GPT** sem tud egyértelműen dönteni** (projekt / mit csináljunk vele).

## 1. cron — lokális LLM (Qwen), óránként

- **Gyakoriság:** minden órában (0–24), **nem** csak munkaidőben.
- **Feladat:**
  - Új / feldolgozandó emailek lekérése (IMAP).
  - **Stage 1:** Qwen besorolás (projekt / irreleváns / bizonytalan).
  - Eredmény **Mission Control triage sorba** írása (`POST /api/emails/triage/register`), **csak Stage 1 mezőkkel** (Stage 2 üres).
- **Értesítés:** **ne** menjen Telegram (és más csatorna se kötelező) — csendes üzem.
- **Ne hozzon létre taskot** ebben a lépésben.

## 2. cron — Sophon GPT, napközben 3 óránként

- **Gyakoriság:** pl. munkaidőben, **3 óránként** (pontos cront külön beállítod CET-ben).
- **Modell:** Sophon alapértelmezett OpenAI (`openai-codex/gpt-5.3-codex`).
- **Feladat:**
  1. Lekéri a sorban lévő tételeket, ahol **még nincs Stage 2** (vagy erre dedikált státusz, pl. „GPT-re vár”).
  2. `GET /api/emails/triage/context` — projektek, KB-rövidítés, szabályok, korábbi korrekciók.
  3. Szükség szerint olvassa a releváns `memory/projects/*.md` részeket.
  4. **Döntés:**
     - **Egyértelmű:** megerősíti vagy finomítja a projektet / irrelevanciát → **automatikusan felvesz taskot** (ugyanaz a logika, mint a jóváhagyásnál: email + task link), **nem** kerül emberi sorba.
     - **Nem egyértelmű:** **nem** vesz fel taskot → sor **emberi döntésre** (Mission Control `/email-triage`).

## Státusz-gondolat (egyszerűen)

| Állapot (elnevezés) | Jelentés |
|----------------------|----------|
| Stage 1 kész, GPT még nem nézte | Sorban vár a 3 óránkénti GPT futásra |
| GPT biztos | Task létrehozva, lezárva |
| GPT bizonytalan | `pending_review` (vagy ezzel egyenértékű) — **te** döntesz |

*(A pontos enum neveket a backendhez igazítjuk; lehet új érték pl. `awaiting_sophon`.)*

## Régi vonal (`email_cron_atomic.sh`)

Ha már nem kell közvetlen task-létrehozás, kapcsold ki vagy ne futtasd párhuzamosan — különben duplikáció / zaj.

## Összefoglaló egy mondatban

**Óránként:** Qwen → sor (Stage 1), csendben. **3 óránként (napközben):** GPT → ha biztos, task; ha nem, te döntesz a MC-ben.
