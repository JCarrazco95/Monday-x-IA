# Guía de despliegue e integración nativa en Monday.com

Esta guía lleva el sistema de "demo en local" a **producción integrado en Monday.com**: las vistas embebidas (Board e Item), la escritura automática en el tablero y el webhook que dispara el análisis IA al crear un lead.

---

## 1. Arquitectura en producción

| Componente | Qué es | Dónde vive |
|---|---|---|
| Frontend (React/Vite) | Vistas embebidas (Board View, Item View) y panel | Hosting estático con HTTPS |
| Backend (Node/Express) | Agentes IA, orquestador, webhook, escritura en Monday | Servidor con HTTPS y URL pública |
| Monday App | App que registra las vistas y el webhook | monday.com Developers |

Monday exige **HTTPS** para vistas y webhooks. No funciona con `localhost`.

---

## 2. Prerrequisitos

- Cuenta de Monday con permiso de administrador para crear apps.
- Tablero de Leads en Monday (con columnas para nombre, empresa/razón social, email, teléfono, RFC, y las de resultado: score, prioridad, riesgo, etc.).
- Token de API de Monday (Admin → API) y el `board_id` del tablero de leads.
- API key del proveedor de IA: Gemini (pruebas) o Anthropic/Claude (producción).
- Node.js 22+ en el servidor.

---

## 3. Variables de entorno (producción)

En `backend/.env` (o variables del hosting):

```
NODE_ENV=production
PORT=4000

# IA (en producción: Claude)
AI_PROVIDER=claude
ANTHROPIC_API_KEY=sk-ant-...

# Monday
MONDAY_API_TOKEN=<token real>
MONDAY_BOARD_ID_LEADS=<id del board de leads>
MONDAY_WEBHOOK_SECRET=<signing secret de la app>

# Mapeo de columnas (si el match por título no basta; opcional)
MONDAY_COL_NOMBRE=
MONDAY_COL_EMAIL=
MONDAY_COL_TELEFONO=
MONDAY_COL_RAZON_SOCIAL=
MONDAY_COL_RFC=

# Gobierno (CompraNet) — ya funcional
GOV_API_ENABLED=true
```

Con `MONDAY_API_TOKEN` presente, los agentes **escriben** en el tablero (sale del modo mock).

---

## 4. Desplegar el backend (con HTTPS)

Opciones recomendadas (cualquiera sirve):

- **Render / Railway / Fly.io**: conectar el repo, build `npm install && npm run build`, start `npm start`. Dan HTTPS automático.
- **VPS propio** (Ubuntu): `npm install && npm run build && npm start` detrás de Nginx + certificado (Let's Encrypt).

Comandos:

```
cd backend
npm install
npm run build
npm start            # node dist/index.js
```

Anota la URL pública, p. ej. `https://api.maxirent-ia.com`.

**Verificación:** abre `https://TU_BACKEND/api/health` → debe responder `{ status: "ok", aiProvider: "claude", mondayMode: "live" }`.

---

## 5. Desplegar el frontend (estático + HTTPS)

```
cd frontend
npm install
# apunta las llamadas /api al backend público (proxy o variable de entorno del hosting)
npm run build        # genera dist/
```

Sube `frontend/dist/` a un hosting estático con HTTPS (Vercel, Netlify, Cloudflare Pages, o el mismo Nginx). Configura que las rutas `/api/*` apunten al backend (reverse proxy o reescritura), o sirve frontend y backend bajo el mismo dominio.

Anota la URL pública del frontend, p. ej. `https://app.maxirent-ia.com`.

---

## 6. Crear la app en Monday Developers

1. Entra a **monday.com → Developers → Build App** (o Developer Center).
2. Crea una app nueva (ej. "MAXIRent · Inteligencia de Leads").
3. En **OAuth & Permissions / Scopes**, habilita como mínimo:
   - `boards:read`, `boards:write`
   - `me:read`
   - (lectura/escritura de items y updates según el board).

---

## 7. Registrar las vistas embebidas

Dentro de la app, agrega **Features**:

- **Board View**
  - Tipo: *Board View*.
  - URL: `https://app.maxirent-ia.com/monday/board`
  - Aparecerá como una vista del tablero de Leads.

- **Item View** (vista dentro de cada item)
  - Tipo: *Item View*.
  - URL: `https://app.maxirent-ia.com/monday/item`
  - El SDK de Monday pasa el `itemId` automáticamente; el código ya lo detecta con `getMondayContext()`.

El rol (admin/vendedor) se resuelve solo con `me { is_admin }` del SDK; no requiere configuración extra.

---

## 8. Registrar el webhook (análisis automático)

Hay dos formas:

**A. Webhook nativo de Monday (recomendado)**
1. En el tablero de Leads → Integraciones / o vía API, crea un webhook al evento **"Cuando se crea un item"** apuntando a:
   `https://api.maxirent-ia.com/api/webhooks/monday`
2. Monday enviará primero un `challenge`; el backend ya lo responde automáticamente.
3. Las peticiones se firman con el `MONDAY_WEBHOOK_SECRET` (la app las valida).

Al crearse un item, el backend lee sus columnas, mapea el lead y dispara el análisis IA, escribiendo el resultado de vuelta en el item.

**B. Vía Make/Zapier**
- Trigger "item creado" en Monday → HTTP POST a `https://api.maxirent-ia.com/api/orchestrator/event` con el JSON del lead. Útil si prefieren no usar el webhook nativo.

---

## 9. Mapeo de columnas del tablero

El webhook intenta detectar las columnas por su **título** (busca "nombre", "empresa/razón social", "email", "teléfono", "rfc"). Si los títulos del board son distintos, fija los **IDs de columna** en el `.env` (`MONDAY_COL_*`).

Para ver los IDs de columna del board:

```
query { boards (ids: [BOARD_ID]) { columns { id title type } } }
```

Las columnas de **resultado** (score, prioridad, riesgo, etc.) que escribe el Monday Writer Agent deben existir en el board; ajusta los IDs en `orchestratorAgent.ts` (objeto `columnUpdates`) según los del tablero real.

---

## 10. Pruebas de verificación (checklist)

- [ ] `GET /api/health` responde `mondayMode: "live"`.
- [ ] Las vistas Board e Item cargan dentro de Monday (sin errores de mixed content/HTTPS).
- [ ] Crear un item de prueba en el board dispara el webhook y aparece el análisis en el item (columnas + comentario).
- [ ] El rol admin/vendedor se muestra correcto según el usuario de Monday.
- [ ] El webhook rechaza peticiones sin firma válida (con `MONDAY_WEBHOOK_SECRET` configurado).

---

## 11. Notas

- Costos operativos: uso de IA (Claude), hosting del backend/frontend y plan de Monday.
- Seguridad: mantener el `MONDAY_API_TOKEN` y las API keys solo en variables de entorno del servidor (nunca en el frontend ni en el repo).
- El `.env` debe estar en `.gitignore` (ya lo está).
