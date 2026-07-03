# 06 · Guía de instalación y despliegue

Consolida lo que estaba repartido entre el `README.md` raíz,
`call-intelligence/flujo-aircall-trigger.md`, `docs/DEPLOY-RENDER.md` y
`docs/DESPLIEGUE-MONDAY.md`.

## Requisitos

- **Node.js 22+** (el backend usa el módulo nativo `node:sqlite`; sin
  dependencias nativas). Probado también en Node 24.
- Opcional para modo real: cuenta de Anthropic (`ANTHROPIC_API_KEY`) o Google
  Gemini (`GEMINI_API_KEY`), y cuenta de Monday.com con token de API.

---

## 1. Backend (`backend/`)

```bash
cd backend
cp .env.example .env          # y llena tus API keys si las tienes (opcional en demo)
npm install
npm run seed                  # crea la BD y siembra los agentes (+ bitácora de ejemplo)
npm run dev                   # tsx watch en http://localhost:4000
```

Verifica: `curl http://localhost:4000/api/health` → debe responder
`{"status":"ok", ...}`. En demo verás `aiProvider:"demo"`, `mondayMode:"mock"`,
`db:"sqlite"`.

Scripts:

| Comando | Qué hace |
|---------|----------|
| `npm run dev` | Desarrollo con recarga (tsx watch), puerto 4000 |
| `npm run build` | Compila TypeScript a `dist/` (`tsc`) |
| `npm start` | Producción: `node dist/index.js` |
| `npm run seed` | Siembra agentes (deja `call_intelligence` **activo**) |

**Modo demo sin IA:** pon `AI_PROVIDER=demo` en `backend/.env` (o simplemente no
configures ninguna API key). Los agentes usan heurísticas; la bitácora registra todo.

> El agente Call Intelligence **debe estar `active`** (el seed ya lo deja así). Si
> tu BD es vieja, corre `npm run seed` o actívalo desde el panel de Agentes.
> `node:sqlite` es experimental en Node 22 → imprime un warning, funciona.

---

## 2. Frontend (`frontend/`)

```bash
cd frontend
npm install
npm run dev                   # Vite en http://localhost:5173 (proxy /api → :4000)
```

Scripts:

| Comando | Qué hace |
|---------|----------|
| `npm run dev` | Vite dev server, puerto 5173 |
| `npm run build` | `vite build` (⚠️ **no** corre `tsc`, ver nota) |
| `npm run typecheck` | `tsc -b` (chequeo de tipos aparte) |

> **Nota:** `npm run build` es solo `vite build` porque `monday-sdk-js` trae `.ts`
> que chocan con la config estricta y rompían el build. El typecheck vive en
> `npm run typecheck`; hoy reporta los errores conocidos de `monday-sdk-js` **y dos
> errores reales en `Pipeline.tsx`** (ver [01 · M3](01-analisis-tecnico.md)).

### Atajo Windows

`INICIAR-DEMO.bat` (en la raíz) levanta la demo local de un doble clic.

---

## 3. Webhook handler de Call Intelligence (`call-intelligence/webhook-handler/`)

Servicio **independiente** (opcional; el backend principal ya ingiere Aircall).

```bash
cd call-intelligence/webhook-handler
cp .env.example .env          # rellena tokens e IDs de columna del board
npm install
npm start                     # escucha en :8080 → POST /webhook
```

Necesita URL pública (Monday llama desde internet): `ngrok http 8080` para pruebas,
o Render/Railway/Cloud Run en producción. Variables clave: `MONDAY_TOKEN`,
`ANTHROPIC_API_KEY`, `OPENAI_API_KEY` (solo si transcribes audio con Whisper),
`AIRCALL_BOARD_ID` y los `COL_*` con los IDs de columna. Guía paso a paso del
disparador en Monday: `call-intelligence/flujo-aircall-trigger.md`.

---

## 4. Despliegue en producción (Render)

El repo trae un **blueprint** (`render.yaml`) que crea 3 recursos:

- `maxirent-backend` (Docker, `backend/Dockerfile`, healthcheck `/api/health`).
- `maxirent-frontend` (Docker, Vite→Nginx que hace proxy de `/api` al backend).
- `maxirent-db` (Postgres gestionado; pasa `DATABASE_URL` al backend).

Pasos:

1. Render → **New → Blueprint** → conecta el repo. Se crean los servicios.
2. Rellena las variables `sync:false` (secretos): `ANTHROPIC_API_KEY` /
   `GEMINI_API_KEY`, `MONDAY_API_TOKEN`, `MONDAY_BOARD_ID_LEADS`,
   `MONDAY_WEBHOOK_SECRET`, y (opcional) Aircall/Deepgram. Ver [09](09-variables-entorno.md).
3. Tras el primer deploy del backend, copia su URL pública y pégala en la variable
   `BACKEND_URL` del frontend (Settings → Environment) y re-deploya el frontend.
4. Verifica `GET /api/health` → con token debe decir `mondayMode:"live"` y `db:"postgres"`.

> **Con `DATABASE_URL` presente el backend usa Postgres** (durable, con respaldos);
> sin ella, SQLite local. En el **plan free de Render la BD expira a los 90 días** →
> para un cliente real, subir a plan de pago o usar Neon/Supabase. Las mismas
> imágenes Docker funcionan en Railway/Fly.io.

Detalle adicional en [DEPLOY-RENDER.md](DEPLOY-RENDER.md).

---

## 5. Integración con Monday

1. Crear una app en Monday Developers y registrar la **Board View** / **Item View**
   (apuntando al frontend desplegado) y el **webhook de leads**
   (`https://TU_BACKEND/api/webhooks/monday`).
2. Poner el signing secret de la app en `MONDAY_WEBHOOK_SECRET`.
3. **Ajustar los IDs de columnas reales** del board: `MONDAY_BOARD_ID_LEADS`,
   `MONDAY_COL_*` de entrada y `MONDAY_COLUMN_MAP` de salida (usa
   `GET /api/monday/columns` para descubrir los IDs). Sin `MONDAY_COLUMN_MAP`, el
   Writer funciona en passthrough (dev/demo).

Detalle en [DESPLIEGUE-MONDAY.md](DESPLIEGUE-MONDAY.md).
