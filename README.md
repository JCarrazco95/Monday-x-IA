# MAXIRent × Monday — Sistema de Agentes IA

Sistema de agentes de IA (Claude) integrados con Monday.com para MAXIRent
(renta de vehículos). Agentes:

1. **Form Analysis Agent** — analiza respuestas de formularios de cotización.
2. **Lead Enrichment Agent** — califica y enriquece leads al crearse.
3. **Call Intelligence Agent** — analiza transcripciones de llamadas (Sandler + Challenger).
4. **Next Best Action Agent** — seguimiento determinista (compromisos, leads fríos, riesgos).
5. **Lead Scraper Agent** — prospección y alta masiva de leads.

Todo orquestado por un **Orchestrator Agent** y escrito de vuelta a Monday por
el **Monday Writer Agent** (7 agentes en total). Incluye un **panel de control
web** con Dashboard, Agentes, Call Intelligence, Coaching, Pipeline, Asistente
(chat RAG), Prospección, Seguimiento y Bitácora.

> 📚 Documentación completa y navegable en [`docs/`](docs/README.md): análisis
> técnico, roadmap, arquitectura, referencia de API, despliegue, agentes, modelo
> de datos, variables de entorno y las correcciones aplicadas.

---

## Estructura del proyecto

```
maxirent-monday/
├── backend/            → API + agentes IA (Node + TypeScript + Express + SQLite)
├── frontend/           → Panel de control (React + Vite + Tailwind)
├── call-intelligence/  → Análisis Sandler de llamadas (Aircall → Claude → Monday)
│   ├── webhook-handler/   → Servicio Node que dispara el análisis (índex.js, etc.)
│   ├── agente-prompt.md   → System prompt del agente Sandler
│   ├── esquema-salida.json→ Esquema JSON que valida la salida del agente
│   ├── rubrica-sandler.md → Rúbrica de las 7 etapas y pesos
│   ├── flujo-aircall-trigger.md → Guía de despliegue del webhook paso a paso
│   └── call-intelligence-*.html → Vistas de item para Monday (standalone)
└── docs/
```

---

## Requisitos

- Node.js 22+ (usa el módulo nativo `node:sqlite`, sin dependencias nativas)
- Una cuenta de Anthropic (opcional para modo demo) → `ANTHROPIC_API_KEY`
- Una cuenta de Monday.com con token de API (opcional para modo demo) → `MONDAY_API_TOKEN`

> **Modo demo:** si no configuras las API keys, el sistema funciona igual:
> los agentes generan resultados simulados (heurísticas) pero **toda la
> actividad se registra de verdad en la bitácora**, para poder probar el
> panel de control sin credenciales.

---

## Cómo correrlo

### 1. Backend

```bash
cd backend
cp .env.example .env     # y llena tus API keys si las tienes
npm install
npm run seed              # crea la base de datos y los 5 agentes
npm run dev                # http://localhost:4000
```

### 2. Frontend (panel de control)

```bash
cd frontend
npm install
npm run dev                # http://localhost:5173
```

El frontend hace proxy de `/api/*` hacia `http://localhost:4000`.

---

## Panel de control

- **Dashboard** — KPIs generales, actividad reciente, estado de agentes y
  botones para simular eventos (`Simular formulario`, `Simular lead`,
  `Simular llamada`).
- **Agentes** — tarjetas de cada agente con su rol, modelo, herramientas y
  botón para **activar/pausar**.
- **Agentes → Detalle** — configuración completa, estadísticas y bitácora
  filtrada por ese agente.
- **Call Intelligence** — análisis Sandler + Challenger de una llamada: puntaje y
  banda, etapa más débil, sentimiento, resumen con momento clave, desempeño por
  las 7 etapas (con detalle desplegable) y acciones recomendadas para el vendedor.
  La vista es **totalmente en vivo**: lee el análisis real desde el backend
  (`GET /api/calls/analyzed/:itemId`); en modo demo el backend genera el análisis
  con heurísticas. (El antiguo `MOCK` hardcodeado en el frontend ya no existe.)
- **Bitácora** — registro histórico completo con filtros por agente, tipo de
  evento y búsqueda de texto. Exportable a JSON.
- **Configuración** — agregar entradas manuales a la bitácora e información
  del sistema.

---

## Arquitectura de agentes

```
Evento (webhook Make/Monday)
        │
        ▼
 Orchestrator Agent ──► decide qué agente especializado ejecutar
        │
        ├─► Form Analysis Agent      (form_submitted)
        ├─► Lead Enrichment Agent    (lead_created)
        └─► Call Intelligence Agent  (call_recorded)
                │
                ▼
        Monday Writer Agent ──► escribe columnas, subitems y comentarios en Monday
```

Cada paso queda registrado en la tabla `logs` (bitácora) con: agente, tipo
(info/success/warning/error), título, detalle, referencia al lead/item de
Monday, payload completo y duración.

---

## API del backend

> **Autenticación:** si `API_KEY` está configurada, todos los endpoints (salvo
> `/api/health` y `/api/webhooks/*`) exigen el header `x-api-key`. Sin `API_KEY`
> (dev/demo) la API queda abierta. Ver [Seguridad](#seguridad-y-operación).

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/api/health` | Estado del sistema (modo live/demo, BD, auth on/off) |
| GET | `/api/usage` | Consumo acumulado de tokens de IA por modelo (telemetría de costo) |
| GET | `/api/agents` | Lista de agentes con estadísticas |
| GET | `/api/agents/:id` | Detalle de un agente + últimos 25 eventos |
| PATCH | `/api/agents/:id` | Cambia `status` (`active`/`paused`) o `model` |
| GET | `/api/logs` | Bitácora con filtros `?agent=&type=&search=&limit=` |
| POST | `/api/logs` | Crear entrada manual en la bitácora |
| GET | `/api/logs/export` | Exporta toda la bitácora en JSON |
| POST | `/api/orchestrator/event` | Webhook genérico (Make/Monday) |
| POST | `/api/orchestrator/simulate/:scenario` | Simula `form`, `lead` o `call` |

### Ejemplo: webhook real desde Make

```json
POST /api/orchestrator/event
{
  "eventType": "lead_created",
  "item": { "itemId": "123456", "itemName": "Juan García", "boardId": "987" },
  "payload": {
    "nombre": "Juan García",
    "email": "juan@empresa.com",
    "telefono": "5551234567",
    "razonSocial": "Empresa SA de CV",
    "rfc": "EMP010101AB1"
  }
}
```

---

## Módulo Call Intelligence (Aircall → Claude → Monday)

Análisis automático de llamadas de venta con el **modelo Sandler**. Vive en
`call-intelligence/` y tiene dos partes:

1. **Webhook handler** (`call-intelligence/webhook-handler/`) — servicio Node
   independiente. Cuando entra un item nuevo al board de Aircall en Monday,
   Monday llama al webhook; el servicio obtiene la grabación, la transcribe (si
   no hay transcript), ejecuta el agente Sandler con Claude y **escribe el JSON
   del análisis, el puntaje y la banda de vuelta en el item**.
2. **Interfaz** — la pestaña **Call Intelligence** del panel
   (`frontend/src/pages/CallIntelligence.tsx`) lee ese JSON y lo muestra. Los
   HTML originales (`call-intelligence-*.html`) siguen disponibles como vista de
   item embebida en Monday.

### Flujo

```
Board Aircall (Monday) ──webhook──► webhook-handler (Node)
                                          │  GET recording + transcribe (Whisper)
                                          ▼
                              Claude + agente-prompt.md ──► JSON (esquema-salida.json)
                                          │
                                          ▼
                     escribe en el item: análisis, puntaje, banda  ──► pestaña Call Intelligence
```

### Correr el webhook

```bash
cd call-intelligence/webhook-handler
cp .env.example .env      # rellena tokens e IDs de columna del board
npm install
npm start                 # escucha en :8080  →  POST /webhook
```

Necesita una URL pública (Monday llama desde internet): `ngrok http 8080` para
pruebas, o Render/Railway/Cloud Run en producción. Variables clave en `.env`:
`MONDAY_TOKEN`, `ANTHROPIC_API_KEY`, `OPENAI_API_KEY` (solo si transcribes
audio), `AIRCALL_BOARD_ID` y los `COL_*` con los IDs de columna.

La guía completa de columnas, registro del disparador en Monday y notas de
costo/seguridad está en **`call-intelligence/flujo-aircall-trigger.md`**.

---

## Seguridad y operación

El backend incluye controles activables por entorno (consistentes con el patrón
demo/real del resto del sistema):

- **Autenticación por API key** — define `API_KEY` en el backend para exigir el
  header `x-api-key` en toda la API (menos `/health` y webhooks). En el servicio
  del frontend se define la MISMA clave (`API_KEY` o `VITE_API_KEY`): Nginx la
  inyecta server-side en el proxy `/api`, así nunca queda en el JS público y se
  rota sin rebuild. Sin `API_KEY`, la API queda abierta (dev/demo) y se imprime
  una advertencia al arrancar.
- **CORS restringido** — `CORS_ORIGINS` (lista separada por comas) limita los
  orígenes permitidos; sin ella se refleja el origen (dev).
- **Rate limiting** — límites por IP: general (`RATE_LIMIT_API`, def. 1000/15min),
  IA/mutaciones (`RATE_LIMIT_AI`, def. 100/5min) y webhooks (`RATE_LIMIT_WEBHOOK`,
  def. 300/5min). Evita el abuso de costo de los endpoints que gastan tokens.
- **PII enmascarada en la bitácora** — `GET /api/logs` y `/api/logs/export`
  devuelven email/RFC/teléfono enmascarados. Los datos completos del lead solo se
  ven en `/api/leads` (tras auth).
- **Webhooks** — firma JWT de Monday y token de Aircall comparados en tiempo
  constante. Cabeceras de seguridad vía `helmet`.
- **Postgres SSL** — `DATABASE_CA_CERT` (PEM del CA) activa verificación estricta
  del certificado; `DATABASE_SSL_STRICT=true` lo fuerza sin CA.
- **Idempotencia** — el Monday Writer no duplica subitems/comentarios si el mismo
  análisis se reprocesa (tabla `monday_writes`).
- **Telemetría y ahorro de costo** — `GET /api/usage` reporta el consumo de tokens;
  el system prompt se cachea (prompt caching de Anthropic) y las llamadas ya
  analizadas se reutilizan (`CALL_ANALYSIS_CACHE`).

Pruebas: `cd backend && npm test` (Vitest). Detalle en
[`docs/01-analisis-tecnico.md`](docs/01-analisis-tecnico.md) y
[`docs/09-variables-entorno.md`](docs/09-variables-entorno.md).

## Próximos pasos (no incluidos aún)

- **Vistas embebidas en Monday** (board view + item view) usando
  `@mondaycom/sdk` + `@vibe/core`, requiere cuenta de developer de Monday y
  `monday-code`/`mapps` CLI.
- Conectar **Deepgram/Whisper** real para transcripción de llamadas.
- Conectar **Make/Zapier** para disparar `/api/orchestrator/event` desde
  Monday automáticamente.
- Fases 4 y 5 del plan original (Operación/Flotilla e Inteligencia de
  negocio) — actualmente fuera de alcance por decisión del cliente.
