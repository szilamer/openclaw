# Email triage (Sophon → OpenAI → Mission Control)

Cél: a **releváns** emailek **teljes szövegének** letöltése a Mac Mini-n (Sophon), majd **OpenAI** alapú projekt-kiosztás, végül **emberi ellenőrzés** Mission Controlban, és **tanuló szabályok** a következő futásokra.

## Folyamat (ajánlott)

1. **IMAP** – csak a már most is „relevánsnak” szűrt üzenetekre futtasd a body letöltést (meglévő `imap.js` / cron logika).
2. **OpenAI (Sophon)** – projektlista + email meta + body (csonkolható token limit miatt) → JSON válasz: `project_id` + rövid indoklás.
3. **Mission Control API** – `POST /api/emails/triage/register` minden üzenetre (lásd alább). **Nem** hoz létre taskot.
4. **Mission Control UI** – `/email-triage`: javítod a projektet, **Jóváhagy** → `EmailMessage` + `Task` + link; vagy **Szabály** → `triage_routing_rules` sor.
5. **Legacy / gyors út** – a régi `POST /api/emails/intake` továbbra is működik; a **TriageRoutingRule** sorokat a `resolveProject` **előbb** alkalmazza, mint a contact/keyword heurisztika.

## API (agent token, mint a többi `/api/emails/*`)

| Módszer | Útvonal | Leírás |
|--------|---------|--------|
| `POST` | `/api/emails/triage/register` | Sor felvétele / frissítése (`source_uid` egyedi). Opcionálisan `suggested_project_id`, `llm_model`, `llm_rationale`. |
| `GET` | `/api/emails/triage/queue?status=pending_review` | Lista (max 500). |
| `PATCH` | `/api/emails/triage/:id` | `{ "action": "set_project", "resolved_project_id": "..." }` \| `approve` \| `reject` |
| `GET` | `/api/emails/triage/rules` | Szabályok (MC UI). |
| `POST` | `/api/emails/triage/rules` | Új szabály: `kind`, `pattern`, `project_id`, opc. `priority`, `name`. |
| `PATCH` | `/api/emails/triage/rules/:id` | Mezők részleges frissítése. |
| `DELETE` | `/api/emails/triage/rules/:id` | Törlés. |
| `GET` | `/api/emails/triage-rules` | Lapos, engedélyezett szabályok priority szerint (Sophon scriptnek). |

### `kind` értékek (szabály + illesztés)

- `sender_email` – pontos cím (kisbetű)
- `sender_domain` – domain (pl. `partner.hu`)
- `subject_contains` – részszöveg a tárgyban
- `body_contains` – részszöveg a testben
- `regex_subject` – regex a tárgyra (`i` flag)

**Priority:** kisebb szám = előbb érvényesül (első találat nyer).

## Adatbázis

- `email_triage_queue` – staging sorok task létrehozás előtt.
- `triage_routing_rules` – felhasználói / javításból származó szabályok.

Migráció: `taskmanager/backend/prisma/migrations/20260315000000_email_triage_queue/`.

## Sophon script irány

1. `GET /api/emails/routing-map` + `GET /api/emails/triage-rules` (opcionális, ha kliens oldalon is akarsz előszűrést).
2. OpenAI hívás a kiválasztott modellel.
3. `POST /api/emails/triage/register` JSON példa:

```json
{
  "source_uid": "account:INBOX:12345",
  "mailbox": "main",
  "from": "Partner <x@y.hu>",
  "to": "info@…",
  "subject": "…",
  "date": "2026-03-15T10:00:00.000Z",
  "body": "…",
  "suggested_project_id": "uuid",
  "llm_model": "gpt-4o",
  "llm_rationale": "Feladó domain egyezik a B projekttel …"
}
```

## Megjegyzés: Qwen vs OpenAI

A felhasználói cron / ügynök továbbra is **Qwen** maradhat; a **projekt-triage** lépéshez külön **OpenAI** API kulcs és script-rész ajánlott (csak erre a lépésre), hogy elválasztott maradjon a költség és a modell.
