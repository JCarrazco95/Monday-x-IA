# ⚠️ DEPRECADO — usar el backend principal

Este servicio independiente fue la **primera versión** de Call Intelligence
(item nuevo en Monday → transcribe con Whisper → análisis Sandler → escribe en
el item). Ya **no debe desplegarse**: el backend principal (`backend/`) cubre
todo su flujo, mejor y con más controles.

| Este handler (legado) | Backend actual |
|---|---|
| `POST /webhook` sin verificación de firma | `POST /api/webhooks/monday` (firma JWT) y `/api/webhooks/aircall` (token, timing-safe) |
| Whisper (OpenAI) | Aircall AI → Deepgram como fallback (`lib/transcription.ts`) |
| Solo Sandler (`agente-prompt.md` + `esquema-salida.json`) | Sandler + Challenger + Integrado + Coaching + Oportunidades (2 pasadas consolidadas) |
| Sin bitácora, sin reintentos, sin idempotencia | Bitácora, reintentos con backoff, idempotencia, rate limit, auth |

**Qué sigue vigente de esta carpeta (`call-intelligence/`):**
- `rubrica-sandler.md` y `rubrica-challenger.md` — documentación de las rúbricas
  (los prompts del backend se basan en ellas).
- `flujo-aircall-trigger.md` — referencia histórica del flujo.
- `call-intelligence-*.html` — vistas standalone para embeber en Monday (opcionales).

La definición canónica del análisis Sandler vive en
`backend/src/agents/callIntelligenceAgent.ts` (7 etapas, pesos que suman 100,
verificados por prueba en `backend/src/__tests__/sandler.test.ts`). El
`esquema-salida.json` de aquí corresponde al formato viejo y no se usa en el
backend.
