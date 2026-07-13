# 04 · Arquitectura

## Componentes

```
maxirent-monday/
├── backend/            API + agentes IA (Node 22 · TypeScript · Express · SQLite/Postgres)
├── frontend/           Panel de control (React · Vite · Tailwind v4)
└── call-intelligence/
    └── webhook-handler/  Servicio Node standalone (Aircall → Whisper → Claude → Monday)
```

- **backend** — expone `/api/*`. Un **Orchestrator** enruta eventos a agentes
  especialistas; el **Monday Writer** es el único que escribe en Monday. Router de
  IA con tres proveedores (claude / gemini / demo). BD con dos drivers
  (SQLite en dev, Postgres si hay `DATABASE_URL`).
- **frontend** — SPA que consume `/api/*` (proxy de Vite en dev, Nginx en prod).
  Reutiliza componentes en las vistas embebidas de Monday (Board/Item View).
- **call-intelligence/webhook-handler** — servicio **independiente** y legado que
  Monday puede llamar cuando entra un item al board de Aircall. El backend
  principal ya reimplementa esta ingesta (`lib/aircallIngest.ts`), por lo que el
  webhook-handler es opcional. Ver [10 · Estado actual](10-estado-actual.md).

## Flujo 1 — Evento de lead → Monday

```mermaid
flowchart TD
    A["Origen del evento<br/>(landing /intake · webhook Monday · Make · simulate · scraper)"] --> B
    B["POST /api/orchestrator/event<br/>handleOrchestratorEvent"] --> C{eventType}
    C -->|form_submitted| D[Form Analysis Agent]
    C -->|lead_created| E[Lead Enrichment Agent]
    C -->|call_recorded| F[Call Intelligence Agent]
    D --> G[MondayWriteInput<br/>claves lógicas fijas]
    E --> G
    F --> G
    G --> H{Monday Writer activo?}
    H -->|sí| I["Monday Writer Agent<br/>updateColumn · createSubitem · postComment"]
    H -->|no| J[Solo bitácora]
    I --> K[(Monday.com<br/>board de Leads)]
    D -. logActivity .-> L[(logs)]
    E -. logActivity .-> L
    F -. logActivity .-> L
    I -. logActivity .-> L
    B -. logActivity .-> L
```

Cada agente comprueba su propio `status` (`active`/`paused`) en la tabla `agents`
antes de ejecutar; si está pausado, deja un log `warning` y devuelve un
`MondayWriteInput` vacío. La escritura a Monday solo ocurre si el `itemId` es
numérico (guarda de `mondayWriterAgent.ts:62`); los análisis con id no numérico
(`aircall-…`, `url-…`, `call-…`) se guardan solo en la bitácora.

## Flujo 2 — Call Intelligence (Aircall → Claude → Monday)

Hay **dos caminos** hacia el mismo análisis (ambos terminan en `call_recorded`):

```mermaid
flowchart TD
    subgraph Ingesta["Ingesta de llamada (backend: lib/aircallIngest.ts)"]
      W["POST /api/webhooks/aircall<br/>(evento de Aircall)"] --> ING
      M["POST /api/calls/aircall/:id"] --> ING
      U["POST /api/calls/from-url"] --> ING2["ingestCallFromUrl<br/>(Deepgram)"]
      T["POST /api/calls/analyze-transcript"] --> ING3["ingestCallFromTranscript"]
      SB["POST /api/calls/sync-board"] --> SYNC["syncCallsBoard<br/>(lee board de Aircall en Monday)"]
      ING["ingestAircallCall<br/>Aircall AI › Deepgram"] --> EV
      ING2 --> EV
      ING3 --> EV
      SYNC --> ING
    end
    EV["call_recorded → handleOrchestratorEvent"] --> CIA["Call Intelligence Agent"]
    CIA --> P1["Pasada 1 (MODEL_HEAVY):<br/>Sandler + Challenger + Integrado + básicos"]
    CIA --> P2["Pasada 2 (MODEL_HEAVY):<br/>Coaching vendedor + análisis profundo + oportunidades"]
    P1 --> OUT[CallIntelligenceOutput]
    P2 --> OUT
    OUT --> WR["Monday Writer<br/>(si itemId numérico)"]
    OUT -. payload .-> LOGS[(logs)]
    WR --> MB[(Monday item)]
    LOGS --> UI["Panel Call Intelligence<br/>GET /api/calls/analyzed[/:itemId]"]
```

### Camino alterno (legado): webhook-handler standalone

```mermaid
flowchart LR
    A[Board Aircall en Monday] -->|webhook item nuevo| B["webhook-handler (Node :8080)<br/>/webhook"]
    B --> C{¿hay transcript?}
    C -->|no| D["OpenAI Whisper<br/>(transcribe recording)"]
    C -->|sí| E[usa transcript]
    D --> F["Claude + agente-prompt.md<br/>→ JSON (esquema-salida.json)"]
    E --> F
    F --> G["setColumns: análisis · score · banda<br/>postUpdate: resumen"]
    G --> A
```

## Flujo 3 — Entrenamiento (LMS) y su lazo con Coaching

No es un agente (no hay IA de por medio): es contenido estático servido desde
`courses`/`lessons` y personalizado con datos reales de `call_analyses`.

```mermaid
flowchart TD
    CI["Call Intelligence Agent<br/>(análisis Sandler de una llamada)"] -->|"payload"| CA[(call_analyses)]
    CA -->|"etapa Sandler más débil REAL"| REC["GET /api/training/recomendaciones<br/>Tu ruta recomendada"]
    CA -->|"etapa débil de ESA llamada"| CC["lib/coachingComment.ts<br/>leccionParaEtapa()"]
    CC -->|"📚 lección sugerida"| MC["Comentario de coaching<br/>en el item de Monday"]
    CUR[("courses / lessons<br/>(sembrados en código, ES)")] --> REC
    CUR --> CC
    REC --> UI["Pestaña Entrenamiento<br/>(vendedor: cursos + progreso + quiz)"]
    QZ["POST /api/training/courses/:id/quiz<br/>(calificación server-side, 80% aprueba)"] --> LP[(lesson_progress / quiz_results)]
    LP --> ADOP["GET /api/training/adopcion<br/>panel Coaching admin: adopción + correlación"]
```

`POST /api/training/reseed` actualiza el contenido de código conservando el
progreso/quiz existente (re-vincula por título de lección/curso).

## Decisiones de arquitectura (de `CLAUDE.md`)

- En la vista embebida de Monday se muestran **solo Análisis IA + Call
  Intelligence**. Principal / Actualizaciones / Archivos son nativas de Monday: no
  se construyen, se **alimentan** (columnas vía Writer, comentario vía
  `postMondayComment`).
- El rol admin/vendedor viene del SDK de Monday (`me { is_admin }`); en dev se
  puede forzar con `?role=admin|sales`. Desde el 12 jul un vendedor solo ve
  Análisis IA/Prospección/Seguimiento/Entrenamiento (`Layout.tsx`, `main.tsx`).
  **Nota:** este rol solo controla la UI; el backend no lo valida — hallazgo
  vigente [01 · I9](01-analisis-tecnico.md#-i9--la-separación-adminvendedor-no-se-aplica-en-el-backend-vigente).
- **Ya no es cierto que "no haya tabla de análisis".** Desde A.3 (fases 1-3,
  completas) `call_analyses` y `lead_analyses` son el camino de lectura
  principal para Call Intelligence, Leads, Coaching, NBA, Forecast (modo
  estimado) y el Reporte ejecutivo; `logs` quedó como bitácora/auditoría pura
  (con un único fallback legítimo por item para recuperar transcripciones
  viejas). Ver [02 · A.3](02-escalabilidad-roadmap.md) y [08 · Modelo de datos](08-modelo-datos.md).
