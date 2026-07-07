# 10 · Estado actual vs. pendientes

## Implementado y funcionando

Verificado levantando backend + frontend en **modo demo** (sin API keys):
`/api/health` responde, las simulaciones generan análisis, la bitácora los
registra y las páginas del panel cargan.

- ✅ **Orquestador + 6 agentes** (Orchestrator, Form Analysis, Lead Enrichment,
  Call Intelligence, Next Best Action, Monday Writer) + **Lead Scraper**.
- ✅ **Call Intelligence completo**: Sandler (7 etapas) + Challenger + Integrado +
  coaching del vendedor + análisis profundo + oportunidades, en 2 pasadas de IA.
  Historial por lead (board = todo, item = por teléfono).
- ✅ **Router de IA** claude / gemini / demo con fallback seguro.
- ✅ **Capa de BD** con dos drivers (SQLite dev / Postgres prod) e interfaz única.
- ✅ **Panel web**: Dashboard, Agentes (+detalle), Call Intelligence (lista +
  detalle), Coaching, Pipeline, Asistente (chat RAG), Lead Scraper, Next Best
  Action, Bitácora, Configuración, Landing.
- ✅ **Ingesta de llamadas** (Aircall + Deepgram + transcripción pegada + URL +
  sync del board de Aircall) — *plumbing* completo; requiere credenciales reales
  para probar en vivo.
- ✅ **Prospección** con Google Places, licitaciones de gobierno, Lusha y
  directorios (cada fuente cae a demo sin credencial).
- ✅ **Deploy listo**: `backend/Dockerfile`, `frontend/Dockerfile` + Nginx,
  `render.yaml`, y guías `DEPLOY-RENDER.md` / `DESPLIEGUE-MONDAY.md`.
- ✅ **Backend compila limpio** (`tsc`). **Frontend construye** (`vite build`).

## "Modo demo" vs. producción real

| Capacidad | Demo (sin keys) | Producción (con keys) |
|-----------|-----------------|------------------------|
| Análisis de IA | Heurísticas deterministas (`mockFn`) | Claude o Gemini reales |
| Escritura en Monday | Registrada en bitácora, no se envía | Columnas/subitems/comentarios reales |
| Investigación web de leads | Estimación por sector | `webResearch` (Claude/Gemini con búsqueda) |
| Transcripción de llamadas | N/A (se pega texto) | Aircall AI / Deepgram / Whisper |
| Prospección | Datos de demo por fuente | Google Places / Lusha / gov reales |
| Contratos de gobierno | Inferencia de la IA | API de Contrataciones Abiertas/CompraNet |

## Fuera de alcance (decisión del cliente / próximos pasos)

- **Vistas embebidas en Monday** (Board/Item View con `@mondaycom/sdk` + `@vibe/core`):
  el frontend las contempla pero requieren cuenta de developer de Monday y el CLI
  `monday-code`/`mapps` para registrarlas.
- **Deepgram/Whisper real** conectado en vivo (hoy es plumbing con fallback).
- **Make/Zapier** para disparar `/api/orchestrator/event` desde Monday
  automáticamente (hoy se dispara por webhook nativo, landing, sync o simulación).
- **Fases 4 (Operación/Flotilla) y 5 (Inteligencia de negocio)** del plan original.
  Propuesta de cómo se verían en [02 · B](02-escalabilidad-roadmap.md).

## Pendientes técnicos recomendados (de la revisión)

**✅ Ya corregidos** (detalle en [11 · Correcciones](11-correcciones.md)):

- 🔴 Autenticación por API key en el backend (C1).
- 🔴 `GET /api/logs/export` protegido + PII enmascarada en la bitácora (C2).
- 🔴 `/orchestrator/event` y `/simulate/*` tras auth + rate limit de IA (C3).
- 🟠 Rate limiting en endpoints de IA (I1) y CORS restringido + helmet (I2).
- 🟠 Procedencia real/demo/fallback en el análisis de llamada (I3).
- 🟠 Idempotencia del Monday Writer (I4).
- 🟠 Comparación de tokens en tiempo constante (I6) y Postgres con CA (I7).
- 🟠 Pruebas con Vitest (I8) — `npm test`.
- 🟢 `parseReference`/`safeParse` centralizados (M2), duplicados mejorados (M1),
  `Pipeline.tsx`/`mondaySDK.ts` sin errores de tipo (M3), telemetría de tokens (M5),
  `lead_scraper` sembrado, docs actualizados (M4).
- 💰 Reducción de consumo: prompt caching + caché de análisis de llamada.

**✅ También corregidos (Fase 2):**

- Reintentos con backoff exponencial + jitter en las llamadas de IA ante
  429/5xx/timeout (`lib/retry.ts`, configurable con `AI_MAX_RETRIES`).
- Sandler unificado: el backend es la fuente de verdad; el `webhook-handler/`
  quedó marcado como deprecado (`call-intelligence/webhook-handler/DEPRECADO.md`).
- `.docx` temporales (`propuesta/~$*.docx`) eliminados del repo y añadidos a
  `.gitignore`.
- Checklist de salida a producción: [12 · Checklist de deploy](12-checklist-deploy.md).

**✅ También corregidos (Fase 3):**

- **Identidad del vendedor por llamada**: el `user.name` de Aircall (o el
  `ejecutivo` del body en las rutas de ingesta) se propaga hasta el análisis
  (`CallIntelligenceOutput.ejecutivo`). Coaching acepta `?vendedor=&dias=`,
  devuelve `vendedores` + `ranking`, y el frontend tiene selector de
  vendedor/periodo y comparativa clicable.
- **Pipeline con datos reales de Monday**: `GET /api/forecast` lee el board de
  Oportunidades (solo lectura) — ver [05](05-referencia-api.md).

**Pendiente:**

- Quitar la mención a Apollo en la propuesta comercial (`.docx`).
- Biblioteca de mejores llamadas por vendedor (desbloqueada por la Fase 3).
- **Escalabilidad** (volumen 10×–100× o multi-cliente): cola de trabajos + tablas
  de dominio + multi-tenant + validación de sesión de Monday por usuario — ver
  [02](02-escalabilidad-roadmap.md).
