# DingYi — Eszközök (Coding Profile)

A coding profile alapértelmezetten adja: `read`, `write`, `edit`, `apply_patch`, `exec`, `process`, `sessions_*`, `memory_search`, `memory_get`, `image`.

## Scriptek (bind mount a containerben)

| Script | Használat | Példa |
|--------|-----------|-------|
| `taskmanager-api` | TaskManager REST API | `taskmanager-api GET /projects` |
| `trello-api` | Trello REST API | `trello-api GET /boards/ID/cards` |

## Exec és sandbox

- Az `exec` eszköz a sandboxban fut (Docker) — biztonságos kódfuttatás.
- A workspace (`/home/node/.openclaw/workspace-dingyi`) a sandboxban elérhető.
- `npm`, `node`, `pnpm`, `docker` elérhetők a sandboxban.

## Fájlműveletek

- `read` / `write` / `edit` / `apply_patch` — workspace fájlok kezelése.
- A `memory/` könyvtár projekt-specifikus tudásbázis (pl. `memory/projects/PROJEKTNEV.md`).

## Session eszközök

- `sessions_list` — aktív sessionek
- `sessions_history` — session előzmények
- `sessions_send` — üzenet küldése más sessionnek
- `sessions_spawn` — új subagent indítása (pl. LuoJi, Da Shi)

## TaskManager API példák

```
taskmanager-api GET /projects
taskmanager-api GET /tasks?projectId=ID
taskmanager-api GET "tasks?status=Teendo"     # Teendő státuszú feladatok (Teendo = ASCII alias)
taskmanager-api PATCH /tasks/ID '{"status":"Folyamatban"}'
taskmanager-api POST /tasks '{"title":"...","projectId":"..."}'
```

**Státusz értékek:** Beérkező, Teendő (alias: Teendo), Folyamatban, Várakozás, Felülvizsgálat, Kész

### Live Status – terminál frissítés (KÖTELEZŐ minden lépésnél!)

```bash
# Frissítsd MIT CSINÁLSZ ÉPPEN – ez jelenik meg a TaskManager terminálban
taskmanager-api PATCH "tasks/TASK_ID/live-status" '{"liveStatus": "Kód elemzése..."}'

# Hiba jelzése
taskmanager-api PATCH "tasks/TASK_ID/live-status" '{"liveStatus": "❌ Build hiba: Cannot find module X"}'

# Várakozás jelzése
taskmanager-api PATCH "tasks/TASK_ID/live-status" '{"liveStatus": "⏳ Docker build folyamatban..."}'

# Befejezés
taskmanager-api PATCH "tasks/TASK_ID/live-status" '{"liveStatus": "✅ Feladat befejezve"}'
```

### Jegyzetek (humán feladatokhoz)

```bash
taskmanager-api PATCH "tasks/TASK_ID/notes" '{"notes": "Jegyzet szövege"}'
```

## Trello API példák

```
trello-api GET /boards/ID/cards?fields=name,due,idList
trello-api PUT /cards/ID 'idList=LIST_ID'
```
