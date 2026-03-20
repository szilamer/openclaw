# Email Triage Pipeline — Sophon instrukciók

Ez a dokumentum leírja a kétlépcsős email triage folyamatot, amit az email cron job során kell végrehajtani.

## Folyamat áttekintése

```
IMAP fetch + Qwen 2.5:14b lokális (Stage 1) → Sophon review (Stage 2) → MC register → mark-seen
```

## Lépések

### 1. Email-ek letöltése + Stage 1 osztályozás (Qwen lokális LLM)

```bash
exec node skills/imap-smtp-email/scripts/imap.js triage --limit 30
```

Ez letölti az UNSEEN emaileket teljes szöveggel és minden emailre a lokális Qwen 2.5:14b modell (Ollama API-n) segítségével elvégzi az első osztályozást:
- `irrelevant` — spam, hírlevél, automatikus értesítés, reklám
- `relevant_unknown` — üzleti email de nem egyértelmű a projekt
- `classified` — besorolható egy konkrét projektbe (project_id mellékelve)

A parancs JSON-t ad vissza stdout-ra: `{ mailbox, count, emails: [{ uid, from, to, subject, date, body, source_uid, stage1: { classification, model, rationale, project_id } }] }`

Ha `count: 0`, nincs új email — lépj tovább.

### 2. Kontextus lekérése (korábbi korrekciók + szabályok)

```bash
taskmanager-api GET /emails/triage/context
```

Válasz: `{ projects: [...], rules: [...], recentCorrections: [...] }`

Ez tartalmazza:
- **Projektek** nevével, leírásával és KB összefoglalóval
- **Aktív routing szabályok** (user/korrekció-alapú)
- **Utolsó 30 felhasználói korrekció** indoklással — tanulj belőlük!

### 3. Stage 2 review (te, Sophon, mint OpenAI LLM)

Minden emailre, figyelembe véve:
- A Stage 1 osztályozást
- A projekt KB összefoglalókat (`projects[].kbSummary`)
- A korábbi korrekciókat (`recentCorrections`)
- Az aktív routing szabályokat

Döntsd el:
1. **Megerősíted** a Stage 1 besorolást → használd ugyanazt a project_id-t
2. **Felülírod** → más project_id + indoklás
3. **Irreleváns** — ha Stage 1 is irrelevánsnak jelölte és te is annak látod, hagyj `suggested_project_id`-t üresen

Ha releváns KB fájlt találsz a `memory/projects/` könyvtárban, olvasd el a részletesebb kontextusért:
```bash
read memory/projects/PROJEKTNEV.md
```

### 4. Regisztráció Mission Controlba

Minden emailre, **egyenként**:

```bash
taskmanager-api POST /emails/triage/register '{
  "source_uid": "<email.source_uid>",
  "mailbox": "<email.mailbox>",
  "from": "<email.from>",
  "to": "<email.to>",
  "subject": "<email.subject>",
  "date": "<email.date>",
  "body": "<email.body (max 10000 karakter)>",
  "stage1_classification": "<stage1.classification>",
  "stage1_model": "<stage1.model>",
  "stage1_rationale": "<stage1.rationale>",
  "stage1_project_id": "<stage1.project_id vagy null>",
  "suggested_project_id": "<te Stage 2 döntésed, project_id vagy null>",
  "llm_model": "<a te modelled neve>",
  "llm_rationale": "<te Stage 2 indoklásod magyarul>"
}'
```

### 5. Email-ek megjelölése olvasottként

A sikeres regisztráció után jelöld meg az emaileket olvasottként (a UID-k az 1. lépés outputjából):

```bash
exec node skills/imap-smtp-email/scripts/imap.js mark-seen <uid1> <uid2> <uid3> ...
```

## Fontos szabályok

- **Ne hozz létre Task-ot** — a felhasználó jóváhagyja Mission Controlban, az generálja a task-ot
- **Tanulj a korrekciókból** — a `recentCorrections` mező tartalmazza a felhasználó korábbi javításait indoklással; vedd figyelembe ezeket a Stage 2 döntéseidnél
- **Body csonkolás** — ha az email body > 10000 karakter, csonkold a register hívásban (a Qwen prompt max 3000 karaktert kap)
- **Hiba esetén** — ha egy email regisztrálása sikertelen, folytasd a következővel; ne állj le
- **Live status** — ha TASK_ID elérhető, jelezd a haladást:
  ```bash
  taskmanager-api PATCH "tasks/TASK_ID/live-status" '{"liveStatus": "Email triage: 5/12 feldolgozva..."}'
  ```
