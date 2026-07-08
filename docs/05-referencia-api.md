# 05 · Referencia de API del backend

Base URL: `/api` (en dev, proxy de Vite a `http://localhost:4000`). Todas las
respuestas y cuerpos son JSON.

**Autenticación:** si `API_KEY` está configurada en el backend, todos los
endpoints salvo `/api/health` y `/api/webhooks/*` exigen el header
`x-api-key: <API_KEY>` (401 si falta o es inválida). Sin `API_KEY` (dev/demo) la
API queda abierta. Además hay rate limiting por IP (general, IA y webhooks).

Índice: [Salud](#salud) · [Agentes](#agentes) · [Bitácora](#bitácora) ·
[Orquestador](#orquestador) · [Leads](#leads) · [Webhooks](#webhooks) ·
[Call Intelligence](#call-intelligence) · [Next Best Action](#next-best-action) ·
[Coaching](#coaching) · [Forecast](#forecast) · [Asistente](#asistente) ·
[Monday](#monday-utilidades) · [Scraper](#scraper--prospección)

---

## Salud

### `GET /api/health`
Estado del sistema y modo activo.
```json
{ "status":"ok", "claudeMode":"mock", "aiProvider":"demo",
  "mondayMode":"mock", "db":"sqlite", "timestamp":"2026-07-03T06:59:00.248Z" }
```
`claudeMode`: `live|mock` · `aiProvider`: `claude|gemini|demo` · `mondayMode`:
`live|mock` · `db`: `sqlite|postgres` · `auth`: `on|off`.

### `GET /api/calls/analyzed` — filtros
Además de `?phone=`, acepta: `vendedor=` (contiene, sin acentos), `banda=rojo|amarillo|verde`
(sobre la banda global), `desde=YYYY-MM-DD`, `hasta=YYYY-MM-DD`, `q=` (texto sobre
prospecto/resumen/vendedor/id) y `minGlobal=NN`. Los `stats` se calculan sobre el
conjunto filtrado.

### `GET /api/calls/biblioteca?min=75`
C.5 — "Mejores llamadas" para entrenamiento: llamadas con score global ≥ `min`
(def. 75) con material didáctico (momento clave, fortalezas, citas destacadas,
momentos positivos), ordenadas por score descendente.

### `POST /api/calls/sync-board` (asíncrono)
Inicia la sincronización del tablero de Aircall en segundo plano y responde
`202 {started, startedAt}` (o `409` si ya hay una en curso). Body opcional
`{max, since}`. El análisis toma minutos y los proxies HTTP cortan a ~60-100s,
por eso no se espera en el request.

### `GET /api/calls/sync-status`
Estado/resultado de la última sincronización:
`{running, startedAt, finishedAt, result:{leidas, analizadas, yaAnalizadas, sinFuente, errores[]}, error}`.

### `GET /api/reports/executive?dias=7`
C.7 — Reporte ejecutivo del período (1-90 días, def. 7): KPIs de llamadas,
desglose por vendedor, etapa débil, objeciones, leads nuevos/calientes, upsells
y alertas de alta prioridad. Devuelve datos estructurados + `markdown` listo
para enviar. Determinista (no consume IA) y no escribe en Monday.

### `GET /api/admin/demo-data`
Preview (no borra): cuántos análisis generados por heurísticas (demo/fallback) y
simulaciones hay en la bitácora, por agente y con muestra de referencias.

### `POST /api/admin/purge-demo`
Borra esos registros para poder re-analizar con IA real. Requiere
`{"confirm": true}` en el body (400 sin él). `{"sims": false}` conserva las
simulaciones y borra solo demo/fallback. También libera las firmas de
idempotencia (`monday_writes`) de los items afectados.

### `GET /api/usage`
Telemetría de consumo de IA (tokens) acumulada desde el arranque, por modelo +
totales. Sirve para monitorear el costo.
```json
{ "since":"2026-07-03T…", "totales":{ "calls":12, "inputTokens":48210,
  "outputTokens":9134, "cacheReadTokens":31200, "cacheCreationTokens":4100 },
  "modelos":[ { "model":"claude-haiku-4-5", "calls":12, … } ] }
```

---

## Agentes

### `GET /api/agents`
Lista los agentes con estadísticas (`total`, `errors`, `last_event`).

### `GET /api/agents/:id`
Detalle de un agente + sus últimos 25 eventos (`recentLogs`).

### `PATCH /api/agents/:id`
Cambia `status` (`active`|`paused`) y/o `model`.
```json
// Request
{ "status": "paused" }
// Response: el agente actualizado
```

---

## Bitácora

### `GET /api/logs?agent=&type=&search=&limit=`
Bitácora con filtros. `agent` = id de agente o `all`; `type` = `info|success|warning|error|all`;
`search` = texto en título/detalle/referencia; `limit` (máx 1000, def 200).

### `POST /api/logs`
Crea una entrada manual. Requiere `agentId` (debe existir) y `title`.
```json
{ "agentId":"orchestrator", "type":"info", "title":"Nota", "detail":"…", "reference":"#123 · Cliente" }
```

### `GET /api/logs/export`
Exporta **toda** la bitácora como JSON (descarga). ⚠️ Hoy expone PII sin auth
(hallazgo C2).

---

## Orquestador

### `POST /api/orchestrator/event`
Punto de entrada genérico (Make/Monday). `eventType` ∈
`lead_created|form_submitted|call_recorded`. `item.itemId` e `item.itemName`
obligatorios.
```json
// Request (lead_created)
{ "eventType":"lead_created",
  "item":{ "itemId":"123456", "itemName":"Juan García", "boardId":"987" },
  "payload":{ "nombre":"Juan García", "email":"juan@empresa.com",
              "telefono":"5551234567", "razonSocial":"Empresa SA de CV", "rfc":"EMP010101AB1" } }
// Response
{ "skipped":false, "writeInput":{ … }, "writeResult":{ "written":true, "columnsUpdated":[…], "subitemsCreated":0, "commentPosted":true } }
```
Payloads por tipo: `form_submitted` → `payload.formResponses` (objeto
campo→valor); `call_recorded` → `payload.transcript`, `payload.telefono`,
`payload.audioUrl?`.

### `POST /api/orchestrator/simulate/:scenario`
Escenarios demo: `form` | `lead` | `call`. Devuelve `{ event, result }`. El
escenario `call` usa teléfono fijo `8112345678` y una de 3 transcripciones (para
poblar el historial por lead).

---

## Leads

### `POST /api/leads/intake`
Captación desde landing: crea el item en Monday **y** dispara `lead_created`.
Requiere al menos `nombre` o `razonSocial`.
```json
{ "nombre":"Ana Ruiz", "razonSocial":"Logística Ruiz SA de CV",
  "email":"ana@ruiz.mx", "telefono":"8110000000", "mensaje":"Necesito 5 vans" }
// Response: { "itemId":"…", "itemName":"…", "mondayMock":true, "result":{ … } }
```

### `GET /api/leads`
Resumen de todos los leads analizados + KPIs (`stats`: `analizadosHoy`, `total`,
`scorePromedio`, `altoPotencial`, `duplicados`).

### `GET /api/leads/:itemId`
Análisis IA completo de un lead (lead + form + call combinados), reconstruido
desde la bitácora. `404` si aún no tiene análisis.

---

## Webhooks

### `POST /api/webhooks/monday`
Webhook nativo de Monday. Responde el `challenge` en el handshake. Si
`MONDAY_WEBHOOK_SECRET` está configurado (y ≠ `changeme`), verifica la firma JWT
HS256 del header `Authorization` (comparación de tiempo constante). Lee las
columnas del item, mapea el lead y dispara `lead_created`.

### `POST /api/webhooks/aircall`
Webhook de Aircall (`call.ended` / `call.transcription_available` / etc.). Si
`AIRCALL_WEBHOOK_TOKEN` está configurado, valida `body.token`. Ingresa la llamada
(grabación + transcripción vía Aircall AI o Deepgram) y dispara el análisis.
Responde `200` incluso sin transcripción (con `motivo`), para no reintentar.

---

## Call Intelligence

### `GET /api/calls/analyzed?phone=`
Historial de llamadas analizadas (Sandler + Challenger + Global) + `stats`.
Filtra por teléfono si se pasa `phone` (≥7 dígitos).

### `GET /api/calls/analyzed/:itemId`
Análisis completo de una llamada (`call`: `CallIntelligenceOutput`). `404` si no existe.

### `POST /api/calls/aircall/:callId`
Trae una llamada de Aircall por ID y la analiza. Body opcional
`{ transcript?, telefono? }`. `200` si se analizó, `422` con `motivo` si no.

### `POST /api/calls/from-url`
Transcribe (Deepgram) la grabación de una URL y la analiza. Body:
`{ url, telefono?, contacto? }`. `itemId` = `url-<hash>`.

### `POST /api/calls/analyze-transcript`
Analiza una transcripción **ya existente** (sin re-transcribir). Body:
`{ transcript, prospecto?, telefono? }`. `itemId` = `call-<hash>`. Es la vía
recomendada cuando el proveedor ya transcribió.

### `GET /api/calls/board`
Vista previa de las llamadas en el tablero de Aircall en Monday
(`{ configured, total, items }`).

### `POST /api/calls/sync-board`
Lee el tablero de Aircall y analiza las llamadas nuevas (idempotente). Body
opcional `{ max?, since? }`. Devuelve `{ leidas, analizadas, yaAnalizadas, sinFuente, errores, detalle }`.

### `GET /api/calls?phone=`
Historial crudo de llamadas de Aircall del cliente (`{ enabled, calls }`).

---

## Next Best Action

### `GET /api/nba`
Vista previa de la agenda de seguimiento (**no** escribe en Monday). Devuelve un
`NextBestActionReport` (`totalAcciones`, `porPrioridad`, `acciones[]`).

### `POST /api/nba/run`
Ejecuta y **escribe** las alertas de alta prioridad en Monday (columna
`requiere_atencion` + comentario). `{ skipped:true }` si el agente está pausado.

---

## Coaching

### `GET /api/coaching[?vendedor=&dias=]`
Agregación sobre las llamadas analizadas: promedios Sandler/Challenger/Global,
etapa Sandler más débil, distribución de perfiles Challenger, radar de
habilidades, banderas rojas / objeciones / áreas de mejora recurrentes, y
tendencia mensual.

- Sin filtros = **equipo completo**. `?vendedor=<nombre>` acota todas las
  métricas a ese vendedor (identidad tomada del user de Aircall en cada
  llamada, campo `ejecutivo` del análisis). `?dias=<n>` acota a los últimos n días.
- La respuesta incluye siempre `filtro`, `vendedores` (nombres disponibles en el
  periodo) y `ranking` (comparativa por vendedor: llamadas, promedios, verdes/rojas).

---

## Forecast

### `GET /api/forecast`
Pipeline ponderado por probabilidad + funnel + proyección mensual. La respuesta
declara su origen en `fuente`:

- **`monday`** (con `MONDAY_API_TOKEN` + `MONDAY_BOARD_ID_OPORTUNIDADES`): lee el
  board real de Oportunidades (solo lectura, paginado) — montos, etapas, fechas de
  cierre, ejecutivo. Único supuesto: probabilidad de cierre por etapa
  (`FORECAST_PROB_ETAPAS`). Incluye `porEjecutivo`, `stats.ganadoMes/ganadoAnio`
  (por fecha real de cierre) y `objetivos` (board de Objetivos, mejor esfuerzo —
  requiere permisos de visualización del board). Si Monday falla responde **502**
  (nunca sustituye datos reales por estimaciones sin avisar).
- **`estimado`** (sin token, demo): heurística previa desde la bitácora —
  `FORECAST_TICKET_BASE × factor(score)`, probabilidad por llamada/prioridad.

Siempre incluye `supuestos` transparentes (moneda, nota, probabilidades).

---

## Asistente

### `POST /api/assistant/chat`
Chat RAG sobre la bitácora. Body `{ question }`. Recupera los documentos
(lead+llamada por referencia) más relevantes por solapamiento de términos y los
pasa al LLM. Devuelve `{ respuesta, itemsCitados, contexto }`. En modo demo
responde con un resumen determinista de lo recuperado.

---

## Monday (utilidades)

### `GET /api/monday/columns?boardId=`
Lista `id/título/tipo` de las columnas del board (def. el de Leads). Sirve para
construir `MONDAY_COLUMN_MAP`. `400` en modo mock (sin token).

---

## Scraper / prospección

### `GET /api/scraper/sources`
Fuentes disponibles (`id`, `label`, `enabled`): Google Places, licitaciones gov,
Lusha, directorios web.

### `GET /api/scraper/lusha/diagnose?sector=&ciudad=`
Chequeo de salud de la conexión con Lusha (sin gastar créditos ni exponer la key).

### `POST /api/scraper/search`
PREVIEW de prospectos (no escribe). Body `{ source, sector, ciudad?, limite?, page? }`.
Marca duplicados. Devuelve `{ fuente, demo, total, nuevos, duplicados, prospects[] }`.

### `POST /api/scraper/import`
Alta masiva: crea cada prospecto en Monday y dispara `lead_created` (enriquecimiento
+ scoring + Writer). Body `{ prospects: Prospect[] }`. Devuelve
`{ importados, omitidos, itemIds, errores }`.
