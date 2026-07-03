# 08 · Modelo de datos

La BD tiene el **mismo esquema lógico en SQLite y Postgres**
(`backend/src/db/schema.ts`). Diferencias mínimas: `id` autoincremental
(`AUTOINCREMENT` en SQLite / `SERIAL` en Postgres). Timestamps y JSON se guardan
como TEXT generados desde la app (formato idéntico en ambos motores).

> **Importante:** no existe una tabla de "análisis". Los resultados de los agentes
> viven en `logs.payload` (JSON) y se **reconstruyen** por consulta. La tabla
> `logs` funciona a la vez como auditoría, base de datos y cola. Ver
> [02 · A.3](02-escalabilidad-roadmap.md) para la migración recomendada a tablas de dominio.

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
