# 01 · Análisis técnico a fondo

Revisión crítica del código real (no solo la documentación) de `backend/`,
`frontend/` y `call-intelligence/webhook-handler/`. El backend y el frontend se
levantaron en **modo demo** (`AI_PROVIDER=demo`, sin API keys) y funcionan como
describe el README: `/api/health` responde `demo`/`mock`/`sqlite`, las
simulaciones (`/simulate/call|lead|form`) generan análisis y la bitácora los
registra.

Los hallazgos están priorizados por severidad. Cada uno referencia archivo y línea.

---

## Resumen de severidad

| # | Severidad | Hallazgo | Ubicación |
|---|-----------|----------|-----------|
| C1 | 🔴 Crítico | Toda la API es pública: sin autenticación en ningún endpoint | `backend/src/index.ts:41-53` |
| C2 | 🔴 Crítico | `GET /api/logs/export` expone PII de clientes sin auth | `backend/src/routes/logs.ts:72` |
| C3 | 🔴 Crítico | `POST /api/orchestrator/event` sin firma → inyección de eventos y gasto de IA | `backend/src/routes/orchestrator.ts:8` |
| I1 | 🟠 Importante | Sin rate limiting → DoS de costo sobre endpoints de IA | (global) |
| I2 | 🟠 Importante | CORS totalmente abierto | `backend/src/index.ts:27` |
| I3 | 🟠 Importante | Fallo de IA cae a datos demo **silenciosamente** y se escriben a Monday | `backend/src/agents/callIntelligenceAgent.ts:462-476` |
| I4 | 🟠 Importante | Escrituras a Monday no idempotentes (subitems duplicados al reintentar) | `backend/src/agents/mondayWriterAgent.ts:84-93` |
| I5 | 🟠 Importante | La tabla `logs` es a la vez auditoría, base de datos y cola; el "id" de negocio es un string parseado por regex | (transversal) |
| I6 | 🟠 Importante | Comparación de token de Aircall no es de tiempo constante | `backend/src/routes/webhooks.ts:133` |
| I7 | 🟠 Importante | Postgres con `rejectUnauthorized: false` | `backend/src/db/postgresDriver.ts:23` |
| I8 | 🟠 Importante | Cero pruebas automatizadas | (todo el repo) |
| M1 | 🟢 Mejora | Detección de duplicados con `payload LIKE '%email%'` (full scan, frágil) | `backend/src/agents/leadEnrichmentAgent.ts:335-347` |
| M2 | 🟢 Mejora | `parseReference` / `safeParse` duplicados en 6+ archivos | (transversal) |
| M3 | 🟢 Mejora | Errores de tipo reales en `Pipeline.tsx` (typecheck falla) | `frontend/src/pages/Pipeline.tsx:3,115` |
| M4 | 🟢 Mejora | Documentación desactualizada (MOCK, Apollo, "5 agentes") | `README.md`, `CLAUDE.md` |
| M5 | 🟢 Mejora | Sin control ni telemetría de consumo de tokens | (transversal) |

---

## 1. Arquitectura y diseño

**El patrón está bien desacoplado en lo esencial.** El flujo
`Orchestrator → agente especialista → Monday Writer` tiene fronteras limpias:

- `handleOrchestratorEvent` (`orchestratorAgent.ts:34`) es el único punto de
  entrada y decide el agente por `eventType`. Cada agente especialista
  (`formAnalysisAgent`, `leadEnrichmentAgent`, `callIntelligenceAgent`) devuelve
  un tipo estructurado propio y **no conoce a Monday**: es el orquestador quien
  traduce el resultado a `MondayWriteInput` con **claves lógicas fijas y
  deterministas** (`orchestratorAgent.ts:147`, comentario explícito de por qué no
  se usan las claves que "invente la IA"). Buena decisión.
- El `mondayWriterAgent` es el único que toca la API de Monday, con un
  `MONDAY_COLUMN_MAP` que traduce clave lógica → ID real de columna y **omite lo
  no mapeado** para no disparar automatizaciones ajenas (`mondayWriterAgent.ts:38-42`).
  Diseño correcto y defensivo.
- El router de IA (`lib/provider.ts` + `lib/claude.ts` + `lib/gemini.ts`) abstrae
  el proveedor (claude/gemini/demo) detrás de `structuredCompletion` /
  `webResearch`. Los agentes no saben qué proveedor está activo. Excelente.

**Acoplamientos y problemas de diseño:**

- **La bitácora `logs` es la base de datos de facto.** No existe tabla de
  análisis: leads, llamadas, coaching, forecast, NBA y el chat RAG se
  **reconstruyen** leyendo `logs.payload` (JSON) y parseando la columna
  `reference` con la regex `^#(\S+)\s*·\s*(.+)$`. Esa regex aparece **copiada** en
  `routes/calls.ts:27`, `routes/leads.ts:21`, `routes/assistant.ts:33`,
  `routes/forecast.ts:42`, `agents/nextBestActionAgent.ts:52` y
  `lib/aircallIngest.ts:198`. El identificador de negocio del sistema es, en la
  práctica, el string `"#<itemId> · <itemName>"`. Si un `itemName` contiene "·"
  el parseo se rompe. Ver **I5**.
- `leadScraperAgent.importProspects` (`leadScraperAgent.ts:159`) reusa
  `handleOrchestratorEvent` con un payload que incluye `sitioWeb`, `direccion` y
  `origen`, pero `processLeadCreated` (`orchestratorAgent.ts:158`) solo lee
  `nombre/email/telefono/razonSocial/rfc`: esos campos extra se descartan
  silenciosamente. Acoplamiento por payload no tipado (`Record<string, unknown>`).
- El orquestador mezcla dos responsabilidades: enrutar **y** construir el comentario
  de Monday (`buildLeadComment`, `orchestratorAgent.ts:217`, ~25 líneas de
  formateo). Ese formateo de presentación debería vivir junto al Writer o en un
  formateador aparte.

---

## 2. Calidad de código

- **Tipado real, muy poco `any`.** Solo 1 aparición de `any` en `backend/src`
  (`lib/claude.ts`, en el visitor de `extractSources`, justificable). Los
  contratos entre agentes están bien tipados en `agents/types.ts` (294 líneas de
  interfaces). El frontend usa `types.ts` propio. Nivel de tipado alto.
- **Duplicación (M2).** `parseReference` y `safeParse<T>` están reimplementados
  en cada ruta/agente que lee `logs`. Deberían extraerse a un
  `lib/logsRepository.ts` que encapsule "leer el último análisis por referencia",
  eliminando ~6 copias y centralizando el formato de `reference`.
- **Manejo de errores consistente en rutas:** casi todas envuelven en
  `try/catch` y responden `500 { error }`. `logActivity` es auto-protegido y
  nunca lanza (`activityLog.ts:24-51`), lo que hace seguras las llamadas
  fire-and-forget. Bien.
- **Estilo consistente**, comentarios en español que explican el *por qué*
  (no el *qué*), lo cual es útil. El backend compila limpio (`npm run build` = `tsc`).
- **Frontend (M3):** `npm run build` es solo `vite build` (no chequea tipos, por
  el conflicto conocido con `monday-sdk-js`). Al correr `npm run typecheck`
  aparecen, además de los errores pre-existentes de `monday-sdk-js`, **dos
  errores reales del propio código**:
  - `frontend/src/pages/Pipeline.tsx:3` — `Cell` importado y no usado.
  - `frontend/src/pages/Pipeline.tsx:115` — el `formatter` de recharts no acepta
    `(v: number) => string` (el valor puede ser `undefined`).
  Como el build de producción no corre `tsc`, estos errores **no bloquean el
  deploy pero tampoco se detectan en CI**. Recomendación: correr `typecheck` en CI
  excluyendo `node_modules/monday-sdk-js` (via `skipLibCheck`/`exclude`) para que
  los errores propios sí fallen el pipeline.

---

## 3. Seguridad

### 🔴 C1 — La API no tiene autenticación

`backend/src/index.ts:41-53` monta 14 grupos de rutas sin ningún middleware de
auth. Cualquiera que alcance la URL del backend puede:

- Listar y **exportar toda la bitácora** con PII (C2).
- Disparar análisis de IA arbitrarios (`/orchestrator/event`, `/orchestrator/simulate/*`,
  `/leads/intake`, `/calls/analyze-transcript`, `/calls/from-url`) → **gasto de
  tokens a coste del cliente** (C3 + I1).
- Escribir en el board real de Monday vía `/nba/run` y `/scraper/import`.
- Pausar/activar agentes (`PATCH /agents/:id`) y crear entradas en la bitácora
  (`POST /logs`).

**Los únicos endpoints con verificación de origen son los webhooks** (`/webhooks/monday`
firma JWT, `/webhooks/aircall` token). El resto del panel de control queda expuesto.

**Recomendación:** middleware de autenticación (mínimo un `API_KEY` en header para
las rutas de mutación, idealmente sesión/JWT de usuario con rol admin/vendedor —
ya existe la noción de rol en el frontend, pero **no se valida en el backend**). El
`RequireAdmin`/`useRole` del frontend es solo cosmético; un usuario "sales" puede
llamar a `/coaching` o `/nba/run` directo.

### 🔴 C2 — `GET /api/logs/export` filtra PII sin auth

`routes/logs.ts:72`. Verificado en vivo: devuelve **todas** las filas de `logs`,
incluidos los `payload` de `lead_enrichment` que contienen `email`, `rfc` y
`telefono` del cliente (se guardan en `orchestratorAgent.ts:189`:
`payload: { ...result, email, rfc, telefono }`). Es una fuga de datos personales
(LFPDPPP en México) por un endpoint GET sin credenciales.

**Recomendación:** (a) exigir auth admin; (b) considerar **no** persistir
email/RFC/teléfono en `logs.payload` o cifrarlos/enmascararlos; (c) el export
debería redactar PII salvo para admins.

### 🔴 C3 — Webhook genérico sin firma

`routes/orchestrator.ts:8` (`POST /event`) valida el **shape** (`eventType`,
`item.itemId`, `item.itemName`) pero **no verifica origen**. Un atacante puede
inyectar leads/llamadas falsas, contaminar la bitácora (de la que se derivan
coaching, forecast y KPIs) y forzar llamadas a Claude/Gemini. Combinar con la
falta de rate limiting (I1) = **abuso de costo** trivial.

**Recomendación:** exigir la misma firma que el webhook de Monday (o un secreto
compartido con Make) en `/orchestrator/event`, y mover `/simulate/*` detrás de auth
(o deshabilitarlo en producción con `NODE_ENV`).

### 🟠 I1 — Sin rate limiting

No hay `express-rate-limit` ni equivalente. Cada `call_recorded` dispara **2
llamadas a `MODEL_HEAVY`** con la transcripción completa (`callIntelligenceAgent.ts:410,430`);
cada `lead_created` en modo live dispara `webResearch` (hasta 6 búsquedas) +
`structuredCompletion` (`leadEnrichmentAgent.ts:236,250`). Un bucle sobre
`/simulate/call` o `/orchestrator/event` escala el costo linealmente sin freno.

### 🟠 I2 — CORS abierto

`index.ts:27`: `app.use(cors())` sin `origin`. Cualquier web puede llamar a la API
desde el navegador de un usuario. Restringir a los dominios del frontend/Monday.

### 🟠 I6 — Comparación de token no constante

`routes/webhooks.ts:133`: `body.token !== AIRCALL_WEBHOOK_TOKEN` compara con `!==`
(vulnerable a timing). El webhook de Monday sí usa `crypto.timingSafeEqual`
(`webhooks.ts:45`) — bien. Igualar el de Aircall a comparación constante.

### 🟠 I7 — Postgres sin verificación de certificado

`db/postgresDriver.ts:23`: `ssl: { rejectUnauthorized: false }` para hosts no
locales. Acepta cualquier certificado → MITM posible sobre la conexión a la BD.
Es lo habitual con Render, pero para un cliente real conviene fijar el CA.

### Manejo de secretos (correcto)

- `.gitignore` (raíz y `backend/`) ignora `.env` y `*.db`; solo se versionan los
  `.env.example`. Verificado: `git ls-files` no muestra ningún `.env` real. ✅
- Las keys se leen de `process.env` y nunca se loguean. `mondayRequest` no imprime
  el token. ✅
- El `.env.example` trae **placeholders**, no secretos reales. ✅

---

## 4. Persistencia

- **`node:sqlite` (`sqliteDriver.ts`)** es experimental en Node y **single-writer**.
  Con WAL (`PRAGMA journal_mode = WAL`) tolera lecturas concurrentes, pero las
  escrituras se serializan. Para el volumen actual (pocas llamadas/leads al día)
  es suficiente; **no escala** a decenas de escrituras concurrentes.
- La capa de drivers (`db/`) con interfaz única y traducción de placeholders
  `?`→`$n` (`postgresDriver.ts:6`) es una buena abstracción: cambiar a Postgres en
  prod es solo `DATABASE_URL`. El SQL es portable (timestamps/JSON como TEXT,
  `INSERT … RETURNING id`, `CAST(... AS INTEGER)`). Bien pensado.
- **Backups:** en SQLite local no hay ninguno. En Render free, la BD Postgres
  **expira a los 90 días** (`CLAUDE.md §10`, `render.yaml`). Para cliente real:
  plan de pago o Neon/Supabase + respaldos.
- **Riesgo estructural (I5):** al no haber tabla de análisis, todo se reconstruye
  de `logs`. Consecuencias: (a) consultas pesadas que releen y re-parsean todo el
  histórico en cada request (`loadSnapshots` en forecast/nba lee **todos** los
  logs de lead/llamada y los agrupa en memoria); (b) el "estado actual" de un lead
  es el `payload` más reciente, sin control de versión ni migración de esquema;
  (c) la detección de duplicados usa `LIKE '%email%'` sobre el JSON serializado
  (M1) — full table scan y falsos positivos si el email aparece en otro campo.

**Recomendación de migración** (cuando el proyecto crezca): introducir tablas
`leads` y `call_analyses` con columnas indexadas (itemId, telefono, email hash) y
seguir usando `logs` **solo** para auditoría. Ver [02](02-escalabilidad-roadmap.md).

---

## 5. Testing

**No existe ninguna prueba** (sin `test` script, sin `vitest`/`jest`, sin
`*.test.ts`). Para un sistema que escribe en el CRM del cliente y gasta tokens,
esto es el mayor riesgo de regresión. Módulos a cubrir primero, por criticidad:

1. **`parseReference` y el formato `reference`** — es el identificador de todo el
   sistema; un cambio silencioso rompe coaching/forecast/nba/leads/calls a la vez.
2. **`mondayWriterAgent.resolveColumnId` + `runMondayWriterAgent`** — la guardia
   `^\d+$` (no escribir si el itemId no es numérico, `mondayWriterAgent.ts:62`) y
   el passthrough vs. mapa son lógica de negocio que, si falla, escribe basura al
   board real.
3. **`callIntelligenceAgent`: ponderación Sandler** — `mockSandler` calcula
   `puntajeFinal` como promedio ponderado (`callIntelligenceAgent.ts:535`); validar
   que pesos suman 100 y el cálculo es correcto. Igual para `banda()`.
4. **`nextBestActionAgent.parseFechaCompromiso`** — parseo de fechas en español
   (`nextBestActionAgent.ts:84`); un bug marca compromisos vencidos/no vencidos mal.
5. **`leadEnrichmentAgent.finalizeScore`** — la regla dura "sin RFC ni razón
   social → score ≤ 35" (`leadEnrichmentAgent.ts:356`).
6. **Parsers de respuesta de IA** — `parseJsonLoose` (gemini) y el `match(/\{[\s\S]*\}/)`
   del webhook-handler (`analyze.js:68`).

Sugerencia: `vitest` con los `mockFn` ya existentes como fixtures deterministas
(el modo demo ya da entradas/salidas reproducibles sin red).

---

## 6. Manejo de errores y resiliencia

- **Integraciones defensivas (bien):** `monday.ts`, `aircall.ts`,
  `transcription.ts`, `governmentIntel.ts`, `lusha.ts` devuelven `null`/`[]` ante
  fallo de red o falta de credencial en vez de lanzar. El sistema "nunca rompe".
- **🟠 I3 — Fallo de IA cae a demo en silencio.** En `runCallIntelligenceAgent`
  (`callIntelligenceAgent.ts:462-476`) un error de la pasada real hace
  `catch { venta = mockVenta(input) }`. El resultado demo **se escribe a Monday y
  a la bitácora como si fuera un análisis real**, sin marca de procedencia. A
  diferencia del lead enrichment —que sí expone `fuenteAnalisis: "web"|"modelo"|"demo"`
  (`types.ts:89`)— la salida de llamada **no** distingue real vs. fallback. Esto es
  exactamente el riesgo de "datos simulados mezclados con reales" que el
  planteamiento pide vigilar. **Recomendación:** añadir `fuenteAnalisis` a
  `CallIntelligenceOutput` y, si vino de fallback por error, marcarlo o registrar
  un `logActivity` de tipo `warning`.
- **Sin reintentos ni backoff** en las llamadas a Claude/Gemini/Monday. Un 429/503
  transitorio de la IA se convierte directo en datos demo (I3) en vez de reintentar.
- **🟠 I4 — Escrituras a Monday no idempotentes.** `runMondayWriterAgent`
  (`mondayWriterAgent.ts:84-93`) crea subitems por cada compromiso en cada
  ejecución. Si el mismo `call_recorded` se re-procesa (reintento del webhook,
  re-sync del board), se **duplican** subitems y comentarios. No hay clave de
  idempotencia. `syncCallsBoard` sí deduplica análisis por `itemId`
  (`aircallIngest.ts:235`), pero el Writer en sí no.
- **Sin colas:** todo es síncrono dentro del request. El webhook de Aircall
  responde 200 y procesa inline (a diferencia del `webhook-handler/index.js:44`
  que sí usa `process.nextTick` para responder <30s a Monday). Si Claude tarda,
  el request del webhook de Aircall del backend principal puede exceder timeouts.

---

## 7. Modo demo vs. modo real

- **Aislamiento correcto en el router de IA:** `structuredCompletion`
  (`claude.ts:41`) corta en `isMockMode` **antes** de tocar la red y ejecuta
  `mockFn()`. `PROVIDER`/`isMockMode` se resuelven una vez al arranque
  (`provider.ts:33-36`). El gating es limpio.
- **Fallback seguro de proveedor:** si fuerzas `AI_PROVIDER=claude` sin
  `ANTHROPIC_API_KEY`, cae a `demo` (`provider.ts:24`) en vez de romper. Bien.
- **El riesgo real es I3** (arriba): el fallback demo por *error de red* no queda
  marcado. En modo demo declarado (sin keys) todo el sistema anuncia "modo demo"
  en la UI/bitácora, pero un fallo transitorio en producción produce datos demo
  indistinguibles de los reales.

---

## 8. Deuda técnica evidente

- **M4 — Documentación desincronizada con el código:**
  - El `README.md` raíz dice que la pestaña Call Intelligence "muestra datos demo;
    al conectar el backend se reemplaza el `MOCK` de
    `frontend/src/pages/CallIntelligence.tsx`". **Ese MOCK ya no existe**: la página
    hoy es totalmente en vivo (`api.getAnalyzedCall`). El README describe una fase anterior.
  - El `README.md` habla de "5 agentes" y las Prioridades 1-3; el código tiene
    **7 agentes** (se añadieron `next_best_action` y `lead_scraper`) — `seed.ts`
    siembra 6 y `leadScraperAgent` es el 7.º sin fila propia en `agents`.
  - `CLAUDE.md §7` menciona que la propuesta `.docx` "aún menciona add-on Apollo,
    que se descartó". Deuda de contenido comercial.
  - El README raíz no documenta las páginas nuevas (Coaching, Pipeline, Asistente,
    LeadScraper, NextBestAction) ni sus endpoints. Ver [05](05-referencia-api.md).
- **`leadScraperAgent` no está en la tabla `agents`:** deja logs con
  `agentId: "lead_scraper"` (`leadScraperAgent.ts:112`) pero `seed.ts` no lo
  siembra. `POST /logs` rechazaría ese `agentId` (valida existencia,
  `logs.ts:55`), pero `logActivity` interno sí lo inserta → un log con
  `agent_id` sin fila en `agents` haría fallar el `JOIN` de `GET /logs`
  (`logs.ts:32`, INNER JOIN) y esa entrada **no aparecería** en la bitácora. Bug latente.
- **Dos rúbricas de llamada** (`rubrica-sandler.md`, `rubrica-challenger.md`) y el
  prompt del webhook-handler standalone (`agente-prompt.md` + `esquema-salida.json`)
  **divergen** del prompt del backend (`callIntelligenceAgent.ts`). Hay **dos
  implementaciones** del análisis Sandler (el webhook-handler Node standalone y el
  agente del backend) que pueden dar resultados distintos. Decidir cuál es la fuente
  de verdad; el webhook-handler parece legado (el backend ya ingiere Aircall).
- **Modelos hardcodeados vs. env:** `webhook-handler/analyze.js:57` fija
  `claude-sonnet-4-6` por defecto mientras el backend usa `claude-haiku-4-5`
  (`provider.ts:45`). Inconsistencia de costo/calidad entre las dos rutas.
- **Archivos temporales de Office versionados:** `propuesta/~$opuesta-*.docx`
  (locks de Word) están en el repo. Limpiar.

---

## 9. Costos operativos

- **Modelo por defecto económico:** `claude-haiku-4-5` para default y heavy
  (`provider.ts:45-46`, ~$1/$5 por 1M tokens). Decisión sensata.
- **Costo por llamada:** cada `call_recorded` = **2 llamadas heavy** con la
  transcripción completa; la pasada 2 además reenvía los JSON de Sandler y
  Challenger (`callIntelligenceAgent.ts:445-449`). Ya se consolidó de 5 a 2
  llamadas (buena optimización documentada), pero sigue mandando la transcripción
  dos veces. Para transcripciones largas, considerar **prompt caching** de
  Anthropic sobre el bloque de transcripción.
- **Costo por lead (modo live):** `webResearch` con `max_uses: 6`
  (`leadEnrichmentAgent.ts:239`) puede gastar bastante; `company_intel` cachea la
  investigación por empresa (`companyIntel.ts`) — bien, evita re-investigar. Las
  **llamadas no se cachean** (cada re-análisis re-consume).
- **M5 — Sin telemetría de tokens:** no se registra `usage` de las respuestas de
  Claude/Gemini. No hay forma de ver el gasto por lead/llamada ni de poner un tope.
  **Recomendación:** loguear `response.usage` en `logActivity` (payload) y exponer
  un KPI de consumo; añadir un límite mensual configurable.
- **Riesgo de costo no controlado:** C3 + I1 (endpoints de IA públicos y sin rate
  limit) es la vía más directa a una factura inesperada. Es el hallazgo con mayor
  impacto económico.

---

## 10. Lo que está bien hecho (para no romperlo)

- Router de proveedor de IA con modo demo real y fallback seguro.
- Capa de BD con dos drivers e interfaz única portable.
- Claves lógicas deterministas para columnas de Monday + mapa que omite lo no mapeado.
- Integraciones defensivas que nunca tumban el flujo principal.
- Consolidación de 5→2 pasadas de IA por llamada (control de costo).
- Cache de investigación de empresa (`company_intel`).
- Firma JWT del webhook de Monday con comparación de tiempo constante.
- Tipado fuerte y comentarios que explican el *porqué*.
