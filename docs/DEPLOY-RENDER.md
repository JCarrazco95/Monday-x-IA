# Deploy en Render (o Railway/Fly) — un clic con Docker

Esto deja el **backend** y el **frontend** en HTTPS público, requisito para integrarlo en Monday.com.

Archivos incluidos:
- `backend/Dockerfile` — Node 22 + Express + node:sqlite. Hace `build` y arranca con seed idempotente (crea y deja **activo** el agente Call Intelligence).
- `frontend/Dockerfile` + `frontend/nginx.conf.template` — build de Vite servido por Nginx, que **hace proxy de `/api` al backend** (mismo origen → sin CORS).
- `render.yaml` — blueprint que crea ambos servicios.

---

## Opción A — Render (blueprint)

1. Sube el repo a GitHub (si no está).
2. En Render: **New → Blueprint** → conecta el repo. Detecta `render.yaml` y crea:
   - `maxirent-backend` (con disco persistente en `/app/data` para la base SQLite).
   - `maxirent-frontend`.
3. En **maxirent-backend → Environment**, llena las variables (las marcadas `sync:false`):
   - `GEMINI_API_KEY` (pruebas) o `AI_PROVIDER=claude` + `ANTHROPIC_API_KEY` (producción).
   - `MONDAY_API_TOKEN`, `MONDAY_BOARD_ID_LEADS`, `MONDAY_WEBHOOK_SECRET`.
   - (Opcional) `AIRCALL_API_ID`, `AIRCALL_API_TOKEN`, `AIRCALL_WEBHOOK_TOKEN`, `DEEPGRAM_API_KEY`.
4. Espera a que **maxirent-backend** quede en *Live*. Copia su URL, p. ej.
   `https://maxirent-backend.onrender.com`.
5. En **maxirent-frontend → Environment**, pon `BACKEND_URL` = esa URL (sin barra final) y haz **Manual Deploy**.
6. Verifica:
   - `https://maxirent-backend.onrender.com/api/health` → `{ "status": "ok", ... }`.
   - Abre la URL del frontend → debe cargar el panel y la página Call Intelligence.

> Nota: el plan free de Render "duerme" el servicio tras inactividad (primer request tarda unos segundos). Para demo está bien; para producción usa un plan de pago o Railway.

---

## Opción B — Railway

1. **New Project → Deploy from GitHub**.
2. Crea **dos servicios** apuntando al mismo repo:
   - Backend: root `backend/`, usa su `Dockerfile`. Agrega un **Volume** montado en `/app/data`.
   - Frontend: root `frontend/`, usa su `Dockerfile`, variable `BACKEND_URL` = URL pública del backend.
3. Variables de entorno: las mismas del paso A.3.

---

## Verificación rápida (local con Docker, opcional)

```
# backend
docker build -t maxirent-backend ./backend
docker run -p 4000:4000 -e AI_PROVIDER=demo maxirent-backend

# frontend (apuntando al backend local)
docker build -t maxirent-frontend ./frontend
docker run -p 8080:8080 -e PORT=8080 -e BACKEND_URL=http://host.docker.internal:4000 maxirent-frontend
# abre http://localhost:8080
```

---

## Después del deploy: conectar Monday

Sigue `docs/DESPLIEGUE-MONDAY.md` (crear app, registrar Board/Item View con las URLs del frontend, y el webhook `…/api/webhooks/monday`). Para llamadas reales, configura el webhook de Aircall a `…/api/webhooks/aircall`.
