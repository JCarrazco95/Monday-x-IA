# 11 · Correcciones aplicadas

Resumen de los arreglos implementados sobre los hallazgos de
[01 · Análisis técnico](01-analisis-tecnico.md), en orden de severidad. Backend
compila limpio (`npm run build`), 20 pruebas en verde (`npm test`) y el frontend
construye sin errores de tipo propios.

## 🔴 Críticos

| # | Hallazgo | Qué se hizo | Archivos |
|---|----------|-------------|----------|
| C1 | API sin autenticación | Middleware `requireApiKey`: si `API_KEY` está definida, toda la API (menos `/health` y webhooks) exige `x-api-key`. El frontend la envía por `VITE_API_KEY`. Sin `API_KEY` queda abierta (dev/demo) con advertencia al arranque. | `lib/security.ts`, `index.ts`, `frontend/src/lib/api.ts` |
| C2 | `/logs/export` expone PII | La bitácora (`GET /logs` y `/logs/export`) ahora enmascara email/RFC/teléfono (`redactPII`). Los datos completos solo en `/leads`, tras auth. | `lib/security.ts`, `routes/logs.ts` |
| C3 | `/orchestrator/event` sin protección | Cubierto por el gate de API key + rate limit estricto de IA. `/simulate/*` también queda tras auth. | `index.ts` |

## 🟠 Importantes

| # | Hallazgo | Qué se hizo | Archivos |
|---|----------|-------------|----------|
| I1 | Sin rate limiting | Tres limitadores por IP (general, IA/mutaciones, webhooks), configurables por env. | `lib/rateLimit.ts`, `index.ts` |
| I2 | CORS abierto | `CORS_ORIGINS` restringe orígenes en producción; sin ella, refleja el origen (dev). + `helmet`. | `index.ts` |
| I3 | Fallo de IA cae a demo en silencio | Nuevo `fuenteAnalisis` (`ia`/`demo`/`fallback`) en el análisis de llamada; el fallback por error deja un `warning` en la bitácora. | `agents/types.ts`, `agents/callIntelligenceAgent.ts` |
| I4 | Escrituras a Monday no idempotentes | Tabla `monday_writes` + firma de escritura: subitems/comentarios no se duplican al reprocesar el mismo análisis. | `db/schema.ts`, `agents/mondayWriterAgent.ts` |
| I5 / M2 | `logs` como base de datos; `parseReference` duplicado | Helper único `lib/references.ts` (`parseReference`/`formatReference`/`itemIdOf`/`safeParseJson`); se eliminaron 6 copias del parseo. | `lib/references.ts` + 7 consumidores |
| I6 | Token de Aircall no comparado en tiempo constante | `safeCompare` (timing-safe) para Aircall **y** Monday. | `lib/security.ts`, `routes/webhooks.ts` |
| I7 | Postgres `rejectUnauthorized:false` | `DATABASE_CA_CERT` activa verificación estricta; `DATABASE_SSL_STRICT` la fuerza; advertencia si no hay CA. | `db/postgresDriver.ts` |
| I8 | Cero pruebas | Vitest + 20 pruebas: `references`, `security` (redacción/timing-safe), banda y pesos Sandler, fechas del NBA, regla dura de `finalizeScore`. `npm test`. | `src/__tests__/*` |

## 🟢 Mejoras

| # | Hallazgo | Qué se hizo | Archivos |
|---|----------|-------------|----------|
| M1 | Duplicados con `LIKE '%valor%'` | Ahora busca el patrón JSON exacto `"email":"…"` / `"rfc":"…"` y excluye correctamente el propio item. | `agents/leadEnrichmentAgent.ts` |
| M3 | Errores de tipo en `Pipeline.tsx` | `Cell` sin usar eliminado y `formatter` tipado. Además se sanearon los tipos de `mondaySDK.ts`. `typecheck` sin errores propios. | `frontend/src/pages/Pipeline.tsx`, `frontend/src/lib/mondaySDK.ts` |
| M4 | Documentación desactualizada | README y docs actualizados: `MOCK` eliminado, 7 agentes, endpoints nuevos, sección de seguridad y variables. | `README.md`, `docs/*` |
| M5 | Sin telemetría de tokens | `lib/usage.ts` + `GET /api/usage`; se registra el `usage` de Claude y Gemini. | `lib/usage.ts`, `lib/claude.ts`, `lib/gemini.ts`, `index.ts` |
| §8 | `lead_scraper` sin fila en `agents` | Sembrado en `seed.ts` (sus logs ya aparecen en la bitácora). | `db/seed.ts` |

## Reducción de consumo de IA (costos)

- **Prompt caching de Anthropic**: el system prompt de los agentes (grande y
  estático) se marca con `cache_control`, así el prefijo cacheado se lee en vez de
  re-facturarse en cada llamada. `lib/claude.ts`.
- **Caché de análisis de llamada**: si una llamada ya fue analizada (mismo
  `itemId`), se reutiliza el resultado en vez de gastar 2 llamadas a la IA
  (webhooks/sync repetidos). Desactivable con `CALL_ANALYSIS_CACHE=false`.
- **Telemetría** (`/api/usage`) para vigilar el gasto y detectar picos.

## Nuevas variables de entorno

`API_KEY`, `CORS_ORIGINS`, `RATE_LIMIT_API`, `RATE_LIMIT_AI`,
`RATE_LIMIT_WEBHOOK`, `CALL_ANALYSIS_CACHE`, `DATABASE_CA_CERT`,
`DATABASE_SSL_STRICT`, y en el frontend `VITE_API_KEY`. Ver
[09 · Variables de entorno](09-variables-entorno.md) y `backend/.env.example`.

## Cómo verificar

```bash
cd backend && npm run build && npm test    # compila + 20 pruebas
cd ../frontend && npm run build            # build del panel

# Auth (prod): con API_KEY definida
API_KEY=secreto node dist/index.js
curl -s -o /dev/null -w "%{http_code}" http://localhost:4000/api/agents          # 401
curl -s -H "x-api-key: secreto" http://localhost:4000/api/agents                 # 200
```

## Fase 2 (robustez) — también aplicada

- **Reintentos con backoff**: `lib/retry.ts` (exponencial + jitter; solo errores
  transitorios 429/5xx/timeout) envuelve todas las llamadas a Claude y Gemini.
  Config: `AI_MAX_RETRIES` (def. 2), `AI_RETRY_BASE_MS` (def. 1000). +5 pruebas.
- **Sandler unificado**: el backend es la fuente de verdad; el `webhook-handler/`
  legado quedó deprecado (`call-intelligence/webhook-handler/DEPRECADO.md`).
- **Limpieza**: `propuesta/~$*.docx` fuera del repo + regla en `.gitignore`.
- **Checklist de deploy**: [12 · Checklist de deploy](12-checklist-deploy.md).

## Pendiente (fuera de este alcance)

- **Multi-tenant + tablas de dominio + cola de trabajos** (escalabilidad 10×–100×):
  ver [02 · Escalabilidad](02-escalabilidad-roadmap.md). La autenticación actual
  por API key es adecuada para un despliegue interno; para validar la sesión real
  de cada usuario de Monday (en vez de una clave compartida) haría falta integrar
  el token de sesión del SDK de Monday en el backend.
