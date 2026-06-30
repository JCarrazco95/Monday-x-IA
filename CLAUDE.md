# MAXIRent · Inteligencia de Leads + Call Intelligence (integración Monday.com)

Contexto para retomar el proyecto en Claude Code. Plataforma de inteligencia comercial
para **MAXIRent** (renta de flotillas, Monterrey, MX) integrada a **Monday.com**.
La construye Jorge "Coque" Carrazco para venderla a MAXIRent.

---

## 1. Qué es

- Capta leads (landing / Monday), los **enriquece y califica con IA**, y analiza **llamadas de ventas**
  con dos modelos (Sandler + Challenger) + coaching del vendedor.
- Se integra a Monday como **vistas embebidas** (Board View, Item View) y escribe resultados en el tablero.
- Demo local con datos simulados; pensado para desplegarse en HTTPS e integrarse en Monday.

## 2. Stack y arquitectura

Monorepo en `maxirent-monday/`:

- **backend/** — Node 22 (ESM, NodeNext, imports con `.js`), Express, TypeScript.
  - DB: capa **async con dos drivers** (`db/`): SQLite (`node:sqlite`) en dev local; **Postgres** (`pg`) en prod si hay `DATABASE_URL`. Interfaz única `db.query/queryOne/run` con placeholders `?` (el driver PG los traduce a `$n`). Llamar `initDb()` en el arranque (lo hace `index.ts`). SQL portable: timestamps/JSON como TEXT generados en JS; `INSERT … RETURNING id`; `CAST(... AS INTEGER)` en agregados.
  - DB: bitácora `logs` (cada agente deja su `payload` JSON). No hay tabla de análisis: se reconstruye desde `logs`.
  - IA con **router de proveedor** (`lib/provider.ts`): `AI_PROVIDER` fuerza claude|gemini|demo; si no, autodetecta por API key. `demo` = sin red, usa mocks.
  - Integraciones **defensivas**: si falla la red o falta credencial, devuelven null/[] (nunca rompen).
- **frontend/** — React + Vite + Tailwind v4 (`@theme` en `index.css`), React Router, lucide-react, recharts, framer-motion.
  - Tema claro MAXIRent. `BASE = "/api"` (en dev, proxy de Vite a :4000; en prod, Nginx hace proxy).

### Flujo de un evento
`webhook/landing/simulate` → `handleOrchestratorEvent` (orchestratorAgent) → agente especialista
(`leadEnrichmentAgent` | `formAnalysisAgent` | `callIntelligenceAgent`) → `mondayWriterAgent`
(escribe columnas/comentario/subitems). Todo queda en `logs`; las rutas lo reconstruyen.

## 3. Agentes (backend/src/agents/)

- **orchestratorAgent.ts** — enruta eventos (`lead_created`, `form_submitted`, `call_recorded`).
- **leadEnrichmentAgent.ts** — score 0-100, prioridad, riesgo, investigación de empresa (web/CompraNet), duplicados.
- **formAnalysisAgent.ts** — interpreta formularios de cotización.
- **callIntelligenceAgent.ts** — los 5 análisis se ejecutan en **2 llamadas a la IA consolidadas** (`runVenta` = Sandler+Challenger+Integrado+básicos; `runCoachingOps` = Coaching+Profundo+Oportunidades) para reducir consumo de tokens. La salida (`CallIntelligenceOutput`) es idéntica, así que frontend/coaching/forecast/upsell no cambian. Contenido de los 5 análisis:
  1. Sandler detallado (7 etapas con peso/puntaje/estado/aciertos/fallos/evidencia, recomendaciones).
  2. Challenger Sale (6 dimensiones, perfil del vendedor, insight/reframe/siguiente paso).
  3. Integrado (funde ambos: scoreGlobal, resumen ejecutivo, plan de acción, próxima llamada).
  4. Coaching+Profundo (`vendedor`: puntos clave, qué falló+impacto, mejoras, habilidades; `analisisProfundo`: narrativa, momentos timeline, temas, necesidades, señales de compra, banderas rojas, citas).
  5. Oportunidades (`oportunidades`: upsell/cross-sell — expansion_flota, renovacion_proxima, vehiculo_adicional, upgrade_unidad, servicio_adicional; con potencial y acción). El orquestador escribe `oportunidad_upsell`/`tipo_oportunidad` en Monday y se muestra en la pestaña Llamada de `CallAnalysisTabs`.
  - Cada pasada tiene su `mockFn` rico para modo demo. El agente debe estar **active** (ver seed).
- **nextBestActionAgent.ts** — **determinista** (sin IA). Recorre `logs` y levanta alertas de seguimiento: compromisos sin seguimiento/vencidos, leads calientes/tibios enfriándose, llamadas con banderas rojas. Escribe las de alta prioridad a Monday (columna `requiere_atencion` + comentario) → automatizaciones nativas notifican. Rutas: `GET /api/nba` (preview, no escribe) y `POST /api/nba/run` (escribe). "Cron" interno opcional vía `NBA_CRON_HOURS`. Umbrales `NBA_HORAS_*`. Frontend: `pages/NextBestAction.tsx` (`/seguimiento`).
- **leadScraperAgent.ts** — **prospección y alta masiva de leads** desde fuentes conectables (`lib/leadSources.ts`). `searchProspects` (preview, no escribe) consulta una fuente y marca duplicados; `importProspects` da de alta cada prospecto seleccionado reusando el flujo `lead_created` (enriquecimiento + scoring + Writer), igual que la landing. Dedupe a dos niveles (contra nombres en bitácora + dentro del lote; leadEnrichment también detecta duplicados en el board). Fuentes: **Google Places** (oficial, `GOOGLE_PLACES_API_KEY`), **Licitaciones gov** (Contrataciones Abiertas/CompraNet), **Lusha** (proveedor B2B con cumplimiento, datos tipo LinkedIn — `lib/lusha.ts`, flujo oficial search→enrich, `LUSHA_API_KEY`; NO se scrapea LinkedIn directo: viola ToS+LFPDPPP), **directorios web** (stub HTML, `DIRECTORY_SCRAPER_ENABLED`). Cada fuente cae a demo si falta credencial (`demo: true`). Rutas `routes/scraper.ts` (`GET /sources`, `POST /search`, `POST /import`); frontend `pages/LeadScraper.tsx` (`/prospeccion`).
- **mondayWriterAgent.ts** — escribe en Monday (mock si no hay token).

## 4. Call Intelligence (lo más trabajado)

- Página **board** `frontend/src/pages/CallIntelligenceList.tsx` → lista TODO el historial (`GET /api/calls/analyzed`), columnas Sandler/Challenger/Global + KPIs.
- **Detalle** `frontend/src/pages/CallIntelligence.tsx` (`GET /api/calls/analyzed/:itemId`).
- Vistas compartidas en **`frontend/src/components/CallAnalysisTabs.tsx`** (5 pestañas: Llamada / Vendedor / Sandler / Challenger / Analíticas). Las reusa también el Item View de Monday.
- **Item View** `frontend/src/pages/monday/MondayItemView.tsx`: pestaña Call Intelligence usa `CallAnalysisTabs` + `CallHistory` (lista las llamadas del lead **por teléfono**, cada una abre su análisis).
- Rúbricas de "entrenamiento": `call-intelligence/rubrica-sandler.md` y `rubrica-challenger.md` (prompt+esquema, NO fine-tuning).

### Endpoints clave (backend/src/routes/)
- `calls.ts`: `GET /api/calls/analyzed[?phone=]`, `/api/calls/analyzed/:itemId`, `/api/calls?phone=` (Aircall raw).
- `leads.ts`: `GET /api/leads`, `/api/leads/:itemId` (reconstruye análisis IA del lead).
- `orchestrator.ts`: `POST /api/orchestrator/event`, `/api/orchestrator/simulate/:scenario` (form|lead|call). El escenario `call` usa teléfono fijo `8112345678` y 3 transcripciones para poblar el historial por lead.
- `webhooks.ts`: `POST /api/webhooks/monday` (challenge + firma JWT HS256) y `POST /api/webhooks/aircall` (ingesta llamada + transcripción → análisis).
- `nba.ts`: `GET /api/nba` (preview), `POST /api/nba/run` (escribe alertas en Monday). Frontend `pages/NextBestAction.tsx` (`/seguimiento`).
- `coaching.ts`: `GET /api/coaching` → agregación a **nivel equipo** sobre llamadas analizadas (Sandler/Challenger/Global prom, etapa Sandler más débil, perfiles Challenger, radar de habilidades, banderas rojas/objeciones recurrentes, tendencia mensual). Frontend `pages/Coaching.tsx` (`/coaching`, admin). Hoy NO hay identidad de vendedor por llamada → cuando exista, agrupar por esa clave (ver `groupKey`).
- `forecast.ts`: `GET /api/forecast` → **pipeline ponderado por probabilidad** + funnel + proyección mensual. Supuestos transparentes: `valorEstimado = FORECAST_TICKET_BASE × factor(score)`; probabilidad por llamada (alta/media/baja) o por prioridad del lead. Sustituir por monto real de cotización cuando exista. Frontend `pages/Pipeline.tsx` (`/pipeline`).
- `assistant.ts`: `POST /api/assistant/chat` → **Chat RAG** sobre `logs`. Construye un corpus (lead+llamada por referencia), recupera los docs más relevantes por overlap de términos y los pasa a `structuredCompletion` (claude/gemini); `mockFn` determinista responde en modo demo. Frontend `pages/Assistant.tsx` (`/asistente`).
- `agents.ts`, `logs.ts`, `intake.ts`.

## 5. Aircall (llamadas reales)
- `lib/aircall.ts`: `listCallsByPhone`, `getAircallCall`, `getAircallTranscript`.
- `lib/transcription.ts`: `transcribeRecording` (Deepgram, fallback si no hay Aircall AI).
- Webhook `/api/webhooks/aircall` → trae llamada + transcripción → `call_recorded` → 4 pasadas → aparece en board y, por teléfono, en el Item View del lead.

## 6. Integración Monday — DECISIONES tomadas
- En la vista embebida mostramos SOLO **Análisis IA + Call Intelligence**.
- **Principal / Actualizaciones / Archivos son nativas de Monday**: NO se construyen; se **alimentan**
  (columnas vía Writer Agent, comentario vía `postMondayComment`, archivos opcionales).
- Las pestañas Principal/Actualizaciones/Archivos del board-view de demo son solo "cáscara" visual.
- Rol admin/vendedor: del SDK de Monday (`me { is_admin }`); override en dev con `?role=admin|sales`.

## 7. Estado actual
- ✅ Backend y frontend compilan limpio (filtrando errores pre-existentes de `monday-sdk-js` / `src/lib/mondaySDK.ts`, ver §10).
- ✅ Call Intelligence completo (4 pasadas, 5 secciones, historial por lead, board=todo / item=por teléfono).
- ✅ Aircall ingesta + transcripción (plumbing; requiere credenciales reales para probar en vivo).
- ✅ Deploy listo: `backend/Dockerfile`, `frontend/Dockerfile`+`nginx.conf.template`, `render.yaml`, `docs/DEPLOY-RENDER.md`.
- ✅ Guía Monday: `docs/DESPLIEGUE-MONDAY.md`.
- ✅ Propuesta comercial: `Propuesta-MAXIRent-Plataforma-IA-Leads.docx` (revisar: aún menciona add-on Apollo, que se descartó).

## 8. Pendientes / próximos pasos
- [ ] `git init` + commit + subir a GitHub (para deploy en Render).
- [ ] Deploy backend+frontend en HTTPS (Render blueprint) y verificar `/api/health` = `mondayMode: live`.
- [ ] Crear app en Monday Developers, registrar Board/Item View y el webhook de leads.
- [ ] **Ajustar IDs de columnas reales** del tablero en `orchestratorAgent.ts` (objeto `columnUpdates`) y/o `MONDAY_COL_*` en `.env`.
- [ ] (Opcional) limpiar la propuesta .docx (quitar Apollo) / actualizar pricing.
- [ ] (Opcional) arreglar de raíz los tipos de `src/lib/mondaySDK.ts`.

## 9. Comandos
```
# backend
cd backend && npm install && npm run dev      # tsx watch, :4000
npm run build && npm start                     # producción (node dist/index.js)
npm run seed                                   # siembra agentes (deja call_intelligence ACTIVO)

# frontend
cd frontend && npm install && npm run dev      # Vite :5173 (proxy /api -> :4000)
npm run build                                  # vite build (NO bloquea por tipos)
npm run typecheck                              # tsc -b (chequeo de tipos aparte)

# demo sin IA
AI_PROVIDER=demo en backend/.env
```

## 10. Notas / gotchas
- **`npm run build` del frontend = `vite build`** (sin `tsc -b`) porque `monday-sdk-js` trae `.ts` que chocan con la config estricta y rompían el build. El typecheck vive en `npm run typecheck`.
- El **agente Call Intelligence debe estar `active`** (el seed ya lo deja activo). Si la DB es vieja, correr `npm run seed` o activarlo en el panel Agentes.
- SQLite (`node:sqlite`) es experimental en Node 22 → imprime un warning, funciona.
- En producción la DB es **Postgres gestionado** (durable). El `render.yaml` define el servicio `maxirent-db` y le pasa `DATABASE_URL` al backend. Sin `DATABASE_URL` (dev) usa SQLite local. `/api/health` reporta `db: sqlite|postgres`. Plan free de Render expira la BD a 90 días → subir a plan de pago o Neon/Supabase para cliente real.
- El lag/truncación de archivos que se vio antes era del sandbox de Cowork; en Claude Code (Windows nativo) no aplica.
- **Lusha (`lib/lusha.ts`) — detalles del API verificados contra producción**: endpoint `POST https://api.lusha.com/prospecting/contact/search`, auth header `api_key`. Quirks: (1) `pages.size` debe ser **≥ 10** (si pides menos da 400); pedimos ≥10 y recortamos al límite. (2) Los filtros van envueltos en `filters.companies.include.{…}` (sin `include` → 400). (3) `locations` debe ser **array de OBJETOS** `[{city}]`/`[{country}]`, no strings. (4) `industriesLabels` exige el **catálogo exacto** de Lusha; texto libre (p. ej. "logistica", "Construction") devuelve **0** → por eso el adaptador filtra por ubicación y solo usa el sector como industria con fallback. (5) El **plan gratuito SÍ permite el search**, que ya trae empresa/cargo/contacto/`fqdn` sin gastar; email/teléfono requieren el paso **enrich** (créditos) → `LUSHA_REVEAL=false` los omite. Health check: `GET /api/scraper/lusha/diagnose`.

## 11. Env vars (backend/.env — ver `.env.example`)
`AI_PROVIDER`, `ANTHROPIC_API_KEY` / `GEMINI_API_KEY`, `MONDAY_API_TOKEN`, `MONDAY_BOARD_ID_LEADS`,
`MONDAY_WEBHOOK_SECRET`, `MONDAY_COL_*`, `GOV_API_*`, `AIRCALL_API_ID/TOKEN`, `AIRCALL_WEBHOOK_TOKEN`,
`DEEPGRAM_API_KEY`, `DATABASE_PATH`, `GOOGLE_PLACES_API_KEY`, `LUSHA_API_KEY`, `DIRECTORY_SCRAPER_ENABLED`.
