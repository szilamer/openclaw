# GitHub repo és deploy beállítás

> A projekt GitHubra feltöltése és automatikus deploy a VPS-re push-kor.

## 1. GitHub repo létrehozása

1. Menj a [GitHub](https://github.com/new) oldalra.
2. **Repository name:** `OpenClaw` (vagy `sophon-platform`, ahogy preferálod)
3. **Visibility:** Private (ajánlott) vagy Public
4. Ne jelöld be a "Add a README" opciót – a meglévő kódot töltjük fel.
5. Kattints **Create repository**.

## 2. Lokális repo összekapcsolása

```bash
cd /Users/feherszilamer/Projects/OpenClaw

# Első commit (ha még nincs)
git add .
git status   # ellenőrizd, hogy nincs .env, API kulcs stb.
git commit -m "ci: GitHub deploy workflow + projekt kezdő állapot"

# Remote hozzáadása (cseréld a USERNAME-t a GitHub felhasználónevedre)
git remote add origin https://github.com/USERNAME/OpenClaw.git

# Push
git branch -M main
git push -u origin main
```

## 3. GitHub Secrets beállítása

A deploy-hez SSH kulcs kell a VPS-hez:

1. **GitHub repo** → **Settings** → **Secrets and variables** → **Actions**
2. **New repository secret** – két secret:

| Name | Value |
|------|-------|
| `VPS_HOST` | `23.88.58.202` |
| `SSH_PRIVATE_KEY` | A `root` felhasználó SSH privát kulcsa (teljes tartalom, `-----BEGIN ... END-----` beleértve) |

**SSH kulcs megtekintése** (a Mac Miniről, ahonnan SSH-zol a VPS-re):

```bash
# Ha eddig jelszóval SSH-zol, hozz létre deploy kulcsot:
ssh-keygen -t ed25519 -f ~/.ssh/deploy_openclaw -N ""

# Publikus kulcs másolása a VPS-re
ssh-copy-id -i ~/.ssh/deploy_openclaw.pub root@23.88.58.202

# Privát kulcs (ezt másold a GitHub Secret-be)
cat ~/.ssh/deploy_openclaw
```

## 4. Deploy folyamat

- **Push `main`-re** → GitHub Actions automatikusan deployol
- Csak a `taskmanager/**` és a workflow fájl változásai indítanak deploy-t
- A workflow: `rsync` a VPS-re → `docker-compose build` → `docker-compose up -d` → migráció → health check
- **Privát repo is működik** – a VPS-nek nincs git hozzáférése, a runner rsync-eli a kódot

## 5. Manuális deploy (ha szükséges)

```bash
cd /Users/feherszilamer/Projects/OpenClaw/taskmanager
./deploy-to-vps.sh
```

Vagy a régi rsync-alapú pipeline:

```bash
./scripts/deploy.sh
```
