# OpenClaw cron példák — email triage (2 job)

Másold be a `~/.openclaw/cron/jobs.json` tömbbe (vagy GUI-n), **sessionKey / agentId** igazítsd.

## 1) Stage 1 — óránként, csendben (nincs Telegram)

- **Schedule:** `0 * * * *`, `tz`: `Europe/Budapest` (minden óra 0. perce).
- **Modell:** nem kell nagy LLM; `systemEvent` + shell elég, ha az OpenClaw támogatja.

Példa (OpenClaw változattól függően finomítsd):

```json
{
  "name": "Email triage Stage 1 (Qwen, óránként)",
  "enabled": true,
  "agentId": "sophon",
  "sessionKey": "agent:sophon:telegram:direct:YOUR_CHAT_ID",
  "schedule": {
    "kind": "cron",
    "expr": "0 * * * *",
    "tz": "Europe/Budapest"
  },
  "sessionTarget": "main",
  "wakeMode": "now",
  "payload": {
    "kind": "systemEvent",
    "text": "Futtasd csendben (NINCS telegram értesítés): bash /Users/sophon/.openclaw/workspace/skills/imap-smtp-email/scripts/email-triage-stage1-hourly.sh 50"
  }
}
```

Ha a `systemEvent` mindig küld Telegramot, használj olyan payloadot / beállítást, ami **nem** announce-ol (OpenClaw verzió szerint: delivery kikapcsolása vagy dedikált exec hook).

## 2) Stage 2 — Sophon GPT, 3 óránként (munkaidő)

```json
{
  "name": "Email triage Stage 2 (Sophon GPT, 3h)",
  "enabled": true,
  "agentId": "sophon",
  "sessionKey": "agent:sophon:telegram:direct:YOUR_CHAT_ID",
  "schedule": {
    "kind": "cron",
    "expr": "15 8-17/3 * * *",
    "tz": "Europe/Budapest"
  },
  "sessionTarget": "isolated",
  "wakeMode": "now",
  "payload": {
    "kind": "agentTurn",
    "model": "openai-codex/gpt-5.3-codex",
    "message": "Olvasd és kövesd pontosan: /Users/sophon/.openclaw/workspace/config/agents/email-triage-stage2-sophon.md — minden awaiting_sophon sorra sophon_resolve PATCH.",
    "timeoutSeconds": 3600
  },
  "delivery": {
    "mode": "announce",
    "channel": "telegram",
    "to": "YOUR_CHAT_ID",
    "bestEffort": true
  }
}
```

**Megjegyzés:** Stage 1-hez a `delivery` blokkot **ne** add hozzá, vagy állítsd úgy, hogy ne küldjön üzenetet.
