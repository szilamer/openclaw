# Docker alaphelyzetbe (ha mindig hibával esik ki)

Ha már van elég hely (9+ GB) de a pull/indítás továbbra is hibázik, a Docker belső tárolója lehet sérült. **Alaphelyzetbe állítás:**

1. **Docker Desktop** megnyitása.
2. **Fogaskerék (Settings)** → **Troubleshoot** (vagy **Reset**).
3. **Reset to factory defaults** (Visszaállítás gyári beállításokra) → **Reset**.
4. A Docker újraindul, minden image/konténer törlődik, a belső lemez újra ép.
5. Terminálban:
   ```bash
   cd /Users/feherszilamer/Projects/OpenClaw
   bash io-hiba-javitas.sh
   ```

Ha ez sem segít, használd a **Docker nélküli** telepítést (lásd lent).
