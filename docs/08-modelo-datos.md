# 08 · Modelo de datos

La BD tiene el **mismo esquema lógico en SQLite y Postgres**
(`backend/src/db/schema.ts`). Diferencias mínimas: `id` autoincremental
(`AUTOINCREMENT` en SQLite / `SERIAL` en Postgres). Timestamps y JSON se guardan
como TEXT generados desde la app (formato idéntico en ambos motores).

> **Actualizado:** la migración A.3 ya está completa (fases 1-3). `call_analyses`
> y `lead_analyses` son hoy el camino de **lectura** principal (Call
> Intelligence, Leads, Coaching, NBA, Forecast estimado, Reporte ejecutivo);
> `logs` quedó como **auditoría/bitácora pura**, con un único fallback legítimo
> por item para recuperar transcripciones de análisis anteriores a la
> migración. Ver [02 · A.3](02-escalabilidad-roadmap.md) para el detalle de cada fase.

## Tabla `agents`

Catálogo de agentes y su estado operativo.

| Columna | Tipo | Notas |
|---------|------|-------|
| `id` | TEXT PK | `orchestrator`, `form_analysis`, `lead_enrichment`, `call_intelligence`, `next_best_action`, `monday_writer` |
| `name`, `role`, `description` | TEXT | Metadatos mostrados en el panel |
| `priority` | INTEGER | Orden de listado |
| `status` | TEXT | `active` \| `paused` \| `error` (def. `paused`; el seed activa todos) |
| `model` | TEXT | p. ej. `claude-haiku-4-5` o `deterministic` (NBA) |
| `tools` | TEXT | JSON array de nombres de herramientas (informativo) |
| `version`, `last_run_at`, `created_at`, `updated_at` | TEXT | — |

> `lead_scraper` deja logs pero **no** está en esta tabla (ver
> [01 · §8](01-analisis-tecnico.md)).

## Tabla `logs` — la bitácora (tabla central)

Cada acción de cada agente deja una fila. Es el **corazón del sistema**.

| Columna | Tipo | Notas |
|---------|------|-------|
| `id` | PK autoincremental | — |
| `timestamp` | TEXT | ISO 8601, generado en la app |
| `agent_id` | TEXT | FK lógica a `agents.id` (el `GET /logs` hace INNER JOIN) |
| `type` | TEXT | `info` \| `success` \| `warning` \| `error` |
| `title` | TEXT | Título del evento |
| `detail` | TEXT? | Descripción |
| `reference` | TEXT? | **Identificador de negocio**: `#<itemId> · <itemName>`. Se parsea con regex en todo el sistema |
| `payload` | TEXT? | **JSON del resultado del agente** — de aquí se reconstruyen leads, llamadas, coaching, forecast, NBA y el chat RAG |
| `duration_ms` | INTEGER? | Duración de la tarea |

Índices: `idx_logs_agent`, `idx_logs_timestamp`, `idx_logs_reference`.

**Cómo se usa `payload` por agente:**
- `lead_enrichment` → `LeadEnrichmentOutput` (+ `email`, `rfc`, `telefono` — ojo PII).
- `form_analysis` → `FormAnalysisOutput`.
- `call_intelligence` → `CallIntelligenceOutput` (Sandler/Challenger/Integrado/vendedor/profundo/oportunidades).
- `next_best_action` → array de `NextBestAction` de alta prioridad.

## Tabla `company_intel` — cache de investigación de empresas

Permite que el Lead Enrichment "se eduque": reutiliza y acumula lo aprendido de
cada empresa en vez de re-investigar.

| Columna | Tipo | Notas |
|---------|------|-------|
| `id` | PK | — |
| `key` | TEXT UNIQUE | Clave estable: `rfc:<RFC>` o `rs:<razón social normalizada>` (`companyIntel.ts:23`) |
| `razon_social`, `rfc` | TEXT? | — |
| `research` | TEXT | JSON de `CompanyResearch` |
| `fuente` | TEXT | `web` \| `modelo` \| `demo` |
| `hits` | INTEGER | Veces que se ha consultado/actualizado |
| `first_seen`, `updated_at` | TEXT | — |

Índice: `idx_company_intel_key`.

---

## `esquema-salida.json` (agente Sandler standalone)

`call-intelligence/esquema-salida.json` valida la salida del **webhook-handler
standalone** (JSON Schema draft-07). Estructura principal:

- `meta` — `id_llamada`, `vendedor?`, `prospecto?`, `fuente` (transcripcion|audio),
  `recording_url?`, `aircall_item_id?`, `idioma`.
- `puntaje_final` (0–100), `banda` (rojo/amarillo/verde).
- `etapas` — **exactamente 7** (Sandler), cada una con `id`, `nombre`, `peso`,
  `sub_puntaje` (null = no aplica → se renormaliza), `estado`, `aciertos`,
  `fallos`, `evidencia[]` (citas con `marca_tiempo`/`hablante`).
- `resumen` — `fortalezas`, `areas_mejora`, `momento_clave`.
- `recomendaciones[]` — `prioridad`, `etapa`, `accion`.

> ⚠️ **Dos definiciones de Sandler divergentes.** Este esquema standalone usa
> nombres de etapa (`Solución`, `Aseguramiento`) y pesos (12,15,25,15,15,10,8)
> **distintos** de los del agente del backend (`callIntelligenceAgent.ts:18`:
> `Cierre/Cumplimiento`, `Post-Venta`; pesos 12,13,25,18,17,10,5). El backend usa
> además una estructura mucho más rica (`CallIntelligenceOutput` en
> `agents/types.ts:226`, con Challenger, Integrado, coaching y oportunidades). Al
> decidir la fuente de verdad (ver [10](10-estado-actual.md)), unificar ambos.

El contrato real que consume el frontend es **`CallIntelligenceOutput`**
(`backend/src/agents/types.ts`), no `esquema-salida.json`.

## Tabla `call_analyses` (dominio, A.3 fase 1)

Ultimo análisis de cada llamada, para las lecturas de Call Intelligence (la
tabla `logs` queda como auditoría). Write-through desde el orquestador +
backfill automático al arrancar si está vacía (`db/domain.ts`).

| Columna | Tipo | Notas |
|---|---|---|
| `item_id` | TEXT UNIQUE | `aircall-<id>`, `call-<hash>`, `url-<hash>` o id numérico |
| `item_name` | TEXT | nombre del item/llamada |
| `telefono` / `vendedor` | TEXT (índice) | filtros por cliente y por vendedor |
| `sandler_score` / `challenger_score` / `global_score` | REAL | para filtros/orden sin parsear JSON |
| `banda` | TEXT | rojo/amarillo/verde (global) |
| `fuente` | TEXT | ia / demo / fallback |
| `payload` | TEXT (JSON) | `CallIntelligenceOutput` completo |
| `analyzed_at` (índice) / `updated_at` | TEXT ISO | |

## Tabla `lead_analyses` (dominio, A.3 fase 2)

Último análisis de cada lead — enriquecimiento **y** formulario, mergeados por
`item_id` (columnas separadas para no pisar uno con el otro si llegan en
momentos distintos). Write-through + backfill igual que `call_analyses`
(`db/domain.ts`). Reemplaza el dedupe por `LIKE` sobre `logs.payload` (M1 de
[01](01-analisis-tecnico.md)) por lookup indexado en `email`/`rfc`.

| Columna | Tipo | Notas |
|---|---|---|
| `item_id` | TEXT UNIQUE | id del item de Monday |
| `item_name` | TEXT | nombre del lead |
| `score` | INTEGER (índice indirecto vía `email`/`rfc`) | score 0-100 del Lead Enrichment |
| `prioridad` / `riesgo` | TEXT | caliente/tibia/fría · alto/medio/bajo |
| `duplicado` | INTEGER (0/1) | marcado por `findDuplicateLead` |
| `email` / `telefono` / `rfc` | TEXT (índice) | usados para dedupe y búsqueda |
| `lead_payload` | TEXT (JSON) | `LeadEnrichmentOutput` completo |
| `form_payload` | TEXT (JSON) | `FormAnalysisOutput` completo (si existe) |
| `analyzed_at` (índice) / `updated_at` | TEXT ISO | |

## Tablas de Entrenamiento (LMS, C.8) — sin relación con `logs`/dominio de análisis

Contenido y progreso del módulo **Entrenamiento**; no involucran IA. Sembradas
una sola vez desde código (`db/trainingSeed.ts`) si `courses` está vacía;
`POST /api/training/reseed` las actualiza conservando progreso/quiz por
coincidencia de título.

| Tabla | Columnas clave | Notas |
|---|---|---|
| `courses` | `titulo`, `descripcion`, `etapa_sandler`, `orden`, `publicado`, `quiz` (JSON `QuizQuestion[]`) | Un curso por etapa/tema Sandler |
| `lessons` | `course_id` (FK), `titulo`, `contenido` (Markdown), `video_url?`, `etapa_sandler`, `duracion_min`, `orden` | Lección individual dentro de un curso |
| `lesson_progress` | `lesson_id` (FK), `vendedor`, `completed_at`, UNIQUE(`lesson_id`,`vendedor`) | Idempotente vía `ON CONFLICT DO NOTHING` |
| `quiz_results` | `course_id` (FK), `vendedor`, `score`, `total`, `aprobado`, UNIQUE(`course_id`,`vendedor`) | Se conserva el **mejor intento**; aprueba con ≥80% |

`GET /api/training/recomendaciones` cruza estas tablas con `call_analyses`
(etapa Sandler más débil real del vendedor) para armar "Tu ruta recomendada".
Ver [04 · Flujo 3](04-arquitectura.md#flujo-3--entrenamiento-lms-y-su-lazo-con-coaching).
