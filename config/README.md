# OpenClaw Agents Konfiguráció

Sophon alatti subagentek: DingYi (fejlesztő), LuoJi (marketing), Da Shi (biztonság).

## Struktúra

- `agents-patch.json` — agents config patch (defaults.subagents + list)
- `agents/<id>/AGENTS.md` — szerepkör és viselkedés minden subagenthez
- `deploy-agents.sh` — deploy script a VPS-re

## Subagentek

| Agent   | Szerepkör   | Modell                    | Tools      |
|---------|-------------|---------------------------|------------|
| Sophon  | Orchestrator| default (gpt-5.3-codex)  | full       |
| DingYi  | Fejlesztő   | gpt-5.3-codex (Codex)    | coding     |
| LuoJi   | Marketing   | default                  | messaging  |
| Da Shi  | Security    | default                  | full       |

## Delegálás

Sophon a `sessions_spawn` eszközzel delegál:

```
/sessions_spawn agentId: dingyi task: "Implementáld a X funkciót"
/sessions_spawn agentId: luoji task: "Írj marketing szöveget Y termékhez"
/sessions_spawn agentId: dashi task: "Auditáld a Z konfigurációt"
```

## Deploy

```bash
./config/deploy-agents.sh [vps_host]
# Alapértelmezett: root@23.88.58.202
```

Deploy után indítsd újra a gateway-t a változások érvényesítéséhez.
