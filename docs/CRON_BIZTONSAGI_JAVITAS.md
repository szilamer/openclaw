# Cron jobok – biztonsági javítás (IMAP credential)

> **Probléma:** A `jobs.json` payload message-ben szerepel az `IMAP_PASS='...'` plain text jelszó.
>
> **Megoldás:** Az IMAP credential a `skills/imap-smtp-email/.env` fájlban legyen. A script (dotenv) onnan tölti.

## Lépések

### 1. .env fájl létrehozása a VPS workspace-ben

```bash
# A workspace skills könyvtárban
ssh root@23.88.58.202 "mkdir -p /root/.openclaw/workspace/skills/imap-smtp-email"
```

Hozz létre helyben egy `.env` fájlt (ne commitold!), majd:

```bash
scp skills/imap-smtp-email/.env root@23.88.58.202:/root/.openclaw/workspace/skills/imap-smtp-email/.env
ssh root@23.88.58.202 "chown 1000:1000 /root/.openclaw/workspace/skills/imap-smtp-email/.env"
ssh root@23.88.58.202 "chmod 600 /root/.openclaw/workspace/skills/imap-smtp-email/.env"
```

A `.env` tartalma (példa):
```
IMAP_HOST=mail.logframe.cc
IMAP_PORT=993
IMAP_USER=sophon@logframe.cc
IMAP_PASS=...
IMAP_TLS=true
IMAP_REJECT_UNAUTHORIZED=false
IMAP_MAILBOX=INBOX
```

### 2. Cron payload módosítása

A jelenlegi payload tartalmazza:
```
IMAP_HOST=mail.logframe.cc IMAP_PORT=993 IMAP_USER=sophon@logframe.cc IMAP_PASS='Sophon123!*' ...
```

**Új payload:** A credential ne legyen a message-ben. A script olvassa a `.env`-ből.

Ha az `imap.js` script már támogatja a dotenv-ot (a skill könyvtárában lévő `.env`), akkor a cron message így nézzen ki:

```
Futtasd a 2 órás email-feldolgozást a SOPHON mailboxra (sophon@logframe.cc).

A credentials a skills/imap-smtp-email/.env fájlban vannak. Futtasd:
cd /home/node/.openclaw/workspace && node skills/imap-smtp-email/scripts/imap.js check --limit 20

Szükség esetén fetch:
node skills/imap-smtp-email/scripts/imap.js fetch UID

Feldolgozás: ...
```

**Megjegyzés:** Ha az imap.js NEM tölti a dotenv-ot, akkor a scriptet módosítani kell, hogy a skill könyvtárában keresse a `.env`-t.

### 3. jobs.json frissítése

A módosított payload-dal frissítsd a cron jobot, majd:
```bash
scp /tmp/cron_jobs.json root@23.88.58.202:/root/.openclaw/cron/jobs.json
ssh root@23.88.58.202 "docker restart openclaw"
```
