# TaskManager Frontend UI

## Elérés

- **URL:** http://23.88.58.202:3010
- **Port:** 3010 (a 3001 foglalt a Romify miatt)

## Bejelentkezés

1. Nyisd meg a fenti URL-t a böngészőben
2. Add meg az API tokent (pl. `tm_xxx...` – a generate-agent-token scriptből)
3. A token a localStorage-ban marad – kilépés után is megmarad, amíg ki nem törlöd

## Funkciók

- **Projektlista** – projektek megtekintése, új projekt létrehozása
- **Kanban tábla** – feladatok státusz szerinti oszlopokban (Beérkező → Kész)
- **Feladat létrehozás** – új feladat hozzáadása projekthez
- **Státusz módosítás** – feladat áthelyezése (dropdown)
- **Megjegyzések** – kártya kibontásakor megjegyzés hozzáadása

## VPS indítás (ha docker-compose hibás)

A régi docker-compose (1.29.2) ContainerConfig hibát dobhat. Ha a frontend nem indul:

```bash
docker run -d --name taskmanager-frontend -p 3010:80 \
  --network taskmanager_default \
  --restart unless-stopped \
  taskmanager_frontend:latest
```

## Token generálás

```bash
ssh root@23.88.58.202 'cd /root/taskmanager && docker-compose exec backend npx ts-node scripts/generate-agent-token.ts'
```
