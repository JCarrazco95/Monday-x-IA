# 02 · Escalabilidad y roadmap de producto

Pensado como roadmap de producto (no solo técnico): qué se necesita para crecer
10×–100× o vender la plataforma a otros clientes además de MAXIRent, y qué
features potencian directamente a los vendedores apalancando lo ya construido.

---

## A. Escalabilidad técnica

### A.1 De "pocas llamadas/día" a 10×–100×

| Área | Hoy | Cuello de botella a 10×–100× | Cambio propuesto |
|------|-----|------------------------------|------------------|
| **Cómputo del análisis** | Síncrono dentro del request (webhook/intake) | 2 llamadas heavy por llamada; un pico de webhooks satura Express y agota timeouts | **Cola de trabajos** (BullMQ+Redis o SQS): el webhook encola y responde 200 al instante; workers procesan el análisis. El `webhook-handler/index.js` ya usa `process.nextTick` como versión pobre de esto. |
| **Base de datos** | SQLite `node:sqlite` (single-writer) en dev; Postgres en prod | Escrituras serializadas; forecast/coaching/nba releen **todo** `logs` en cada request | Postgres siempre + **tablas de dominio** (`leads`, `call_analyses`) indexadas, dejando `logs` solo para auditoría (ver A.3). Cachear agregados (coaching/forecast) con TTL. |
| **Rate / costo de IA** | Sin límite | Facturación descontrolada (ver hallazgo C3/I1) | Rate limiting + cuota por tenant + **prompt caching** de Anthropic sobre la transcripción + telemetría de `usage`. |
| **Reconstrucción desde logs** | `loadSnapshots()` carga todo en memoria | O(n) sobre todo el histórico por request; explota con miles de leads | Materializar el estado en tablas; paginación; índices por `itemId`/`telefono`. |
| **Idempotencia** | Writer duplica subitems al reintentar | Con reintentos de cola, duplicación masiva | Clave de idempotencia por `(itemId, tipoAnálisis, hash)`; upsert de columnas; subitems con dedupe por descripción. |
| **Observabilidad** | `console.log` + bitácora | Imposible depurar a escala | Logging estructurado (pino), trazas, métricas (latencia IA, tasa de fallback demo, costo/tenant), alertas. |

### A.2 Multi-tenant (vender a otros clientes además de MAXIRent)

Hoy la app es **mono-tenant**: IDs de board, columnas y el "flavour" MAXIRent
(prompts de renta de flotillas) están en env vars globales y en los system prompts.
Para SaaS multi-cliente:

1. **Modelo de datos con `tenant_id`** en todas las tablas (`agents`, `logs`,
   `company_intel`, futuras `leads`/`call_analyses`) + aislamiento por fila (RLS en
   Postgres) o esquema por tenant.
2. **Configuración por tenant**, no por env: board IDs, `MONDAY_COLUMN_MAP`,
   tokens de Monday/Aircall, umbrales NBA, ticket base del forecast, y **el system
   prompt / vertical** (hoy todo dice "MAXIRent, renta de flotillas"). Extraer los
   prompts a plantillas parametrizadas por industria.
3. **Gestión de credenciales por tenant**: los tokens de Monday/Aircall/Anthropic
   deben guardarse cifrados por cliente (secrets manager), no en un `.env` global.
4. **Onboarding**: un flujo para registrar un board nuevo, mapear columnas
   (ya existe `GET /api/monday/columns` como base) y validar el webhook.
5. **Autenticación y autorización reales** (hoy inexistentes en backend, ver
   [01 · C1](01-analisis-tecnico.md)): usuarios, roles (admin/vendedor/gerente) y
   pertenencia a tenant, validados en el backend — no solo en el frontend.
6. **Aislamiento de costo**: cuota y medición de tokens por tenant para facturar o
   limitar.

### A.3 Migración de datos recomendada

```
logs (auditoría, se queda)          NUEVAS tablas de dominio
────────────────────────            ─────────────────────────
id, timestamp, agent_id,   ──POC──► leads(tenant_id, item_id, telefono,
type, title, payload…                     email_hash, score, prioridad,
                                          estado, updated_at, payload JSONB)
                                    call_analyses(tenant_id, item_id, telefono,
                                          sandler_score, challenger_score,
                                          global_score, vendedor_id, created_at,
                                          payload JSONB)
```

`payload` como `JSONB` conserva la flexibilidad actual pero con columnas
indexadas para las consultas calientes. La reconstrucción desde `logs` se vuelve
un *fallback*/migración, no el camino principal.

> **✅ Fase 1 hecha — `call_analyses`:** tabla de dominio con una fila por
> llamada (item_id UNIQUE, telefono/vendedor/scores indexados, payload JSON).
> El orquestador hace write-through tras cada análisis y al arrancar se puebla
> sola desde `logs` si está vacía (`db/domain.ts`). Las lecturas de Call
> Intelligence (lista, detalle, biblioteca) ya salen de aquí — el detalle pasó
> de un LIKE sobre todo `logs` a un lookup por índice UNIQUE. La purga demo
> también limpia esta tabla.
>
> **✅ Fase 2 hecha — `lead_analyses` + lecturas migradas:** tabla de dominio de
> leads (enriquecimiento + formulario por item, email/rfc indexados) con
> write-through y backfill automático. Migrados: **Leads** (lista + detalle por
> índice), **Coaching** (lee `call_analyses`), **Asistente** (corpus desde las
> dos tablas) y el **dedupe de leads** (por columnas indexadas email/rfc, antes
> LIKE sobre el JSON de logs). **Pendiente fase 3 (coordinar):** forecast (su
> modo demo) y NBA siguen leyendo `logs` — se migran cuando se estabilice el
> trabajo en curso de esos módulos.

---

## B. Fases 4 y 5 pendientes

El README las declara fuera de alcance. Propuesta de cómo se verían:

### Fase 4 — Operación / Flotilla

Cerrar el ciclo post-venta: del *lead* al *contrato* y a la *unidad rodando*.

- **Inventario de flota** en Monday (o BD propia): unidades, categoría,
  disponibilidad, ubicación, estado de mantenimiento.
- **Disponibilidad en tiempo real al cotizar**: hoy `formAnalysisAgent` marca
  `disponibleEnFlota` contra una **lista hardcodeada** (`formAnalysisAgent.ts:6`);
  la Fase 4 la conecta al inventario real.
- **Ciclo de contrato**: cotización → contrato → entrega → devolución, con fechas
  de vencimiento que alimentan al **NBA** (renovaciones) y al **upsell** (ya se
  detecta `renovacion_proxima` en el análisis de llamada).
- **Mantenimiento y telemetría**: alertas de servicio, GPS (ya se detecta como
  oportunidad `servicio_adicional`).
- **Valor:** convierte la herramienta de *ventas* en plataforma de *operación*;
  habilita el forecast con **montos reales** de contrato (hoy estimados por ticket
  base, `forecast.ts:107`).

### Fase 5 — Inteligencia de negocio

- **Dashboard ejecutivo** cross-lead/llamada/flota: ingresos, ocupación de flota,
  CAC, conversión por etapa, rendimiento por vendedor.
- **Modelos predictivos** sobre el histórico ya acumulado en `logs`: probabilidad
  de cierre calibrada con resultados reales (hoy es heurística fija
  `alta/media/baja = 70/40/15%`, `forecast.ts:93`), predicción de churn de cliente,
  demanda de flota por temporada.
- **Reportes automáticos** a dirección (semanal/mensual) — se solapa con la feature
  C.7 de abajo y con el chat RAG ya existente (`assistant.ts`).
- **Valor:** decisiones de compra de flota e inversión basadas en datos.

---

## C. Features para desarrollo de vendedores

Cada una indica **valor de negocio**, **complejidad** (baja/media/alta) y **qué
código actual reutiliza o modifica**. Todas apalancan el motor Call Intelligence
(Sandler + Challenger + coaching) y la bitácora ya existentes.

> **Prerrequisito transversal — ✅ HECHO:** la identidad del vendedor por llamada
> ya se captura: Aircall `user.name` → `payload.vendedor` → `vendedorNombre` en el
> análisis (`callIntelligenceAgent`). La lista de Call Intelligence muestra el
> vendedor y `/api/coaching` devuelve `porVendedor` (promedios + etapa más débil
> por persona), visible en la pestaña Coaching. Las llamadas anteriores a este
> cambio aparecen como "Sin identificar". Con esto C.2–C.7 quedan desbloqueadas.

### C.1 Coaching automatizado post-llamada — ✅ HECHO
- Tras analizar cada llamada del tablero de Aircall, se publica un **update de
  coaching en el item de Monday** (`lib/coachingComment.ts` + `syncCallsBoard`):
  score y banda, etapa a trabajar de ESA llamada, top 3 mejoras priorizadas con
  frase lista para usar y objetivo de la próxima llamada. Idempotente (no se
  duplica al re-sincronizar) y omite buzones/no evaluables. Las automatizaciones
  nativas de Monday pueden notificar al vendedor sobre ese update.

### C.2 Tendencias de desempeño por vendedor — ✅ HECHO
- `/api/coaching` → `porVendedor[].tendencia` (score global mensual por persona).
  En la UI, el panel "Tendencia del score global" tiene selector Equipo/vendedor.

### C.3 Rankings / gamificación por las 7 etapas Sandler
- **Valor:** medio-alto — competencia sana, adopción.
- **Complejidad:** **media.**
- **Reutiliza:** `etapasSandler`/`etapaMasDebil` de `coaching.ts:97`; se agrega un
  leaderboard por vendedor y badges por etapa dominada. Nueva vista frontend.

### C.4 Alertas en tiempo real de llamadas/leads en riesgo
- **Valor:** alto — intervenir antes de perder el trato.
- **Complejidad:** **baja-media.** Ya existe casi entero: `nextBestActionAgent`
  levanta `llamada_requiere_atencion` por banderas rojas y baja probabilidad
  (`nextBestActionAgent.ts:209`) y escribe a Monday. Extenderlo a "etapa Sandler
  débil recurrente" del mismo vendedor (requiere C.2) y notificación push/Slack.
- **Reutiliza:** NBA completo, `analisisProfundo.banderasRojas`, cron `NBA_CRON_HOURS`.

### C.5 Biblioteca de "mejores llamadas" — ✅ HECHO
- `GET /api/calls/biblioteca?min=75`: llamadas con score global ≥ min con su
  material didáctico (momento clave, fortalezas, citas destacadas, momentos
  positivos), ordenadas por score. En la UI: botón **"⭐ Mejores llamadas"** en
  Call Intelligence (junto a los filtros por vendedor/fecha/banda/texto nuevos).

### C.6 Integración con calendario/CRM para seguir las acciones recomendadas
- **Valor:** alto — que las `accionSugerida`/compromisos se conviertan en tareas
  con fecha, no en texto olvidado.
- **Complejidad:** **media** (Google/Microsoft Calendar API + OAuth).
- **Reutiliza:** compromisos ya se crean como **subitems** en Monday
  (`orchestratorAgent.ts:301`); `NextBestAction` ya parsea fechas de compromiso
  (`parseFechaCompromiso`). Falta sincronizar esos subitems/acciones al calendario
  del vendedor y cerrar el loop cuando se completan.

### C.7 Reportes ejecutivos — ✅ HECHO (v1 bajo demanda)
- `GET /api/reports/executive?dias=7|14|30`: KPIs de llamadas y calidad, desglose
  por vendedor, etapa débil del equipo, objeciones recurrentes, leads nuevos/
  calientes, upsells detectados y alertas de alta prioridad, en JSON + `markdown`
  listo para enviar. Determinista (sin costo de IA). En la UI: botón "Reporte
  ejecutivo" en Coaching con selector de período y Copiar.
- **Pendiente v2:** envío automático (cron + email/Slack) cuando haya
  credenciales de correo, y export a PDF/.docx.

### Priorización sugerida (impacto/esfuerzo)

1. **Prerrequisito:** capturar `vendedorId` por llamada. *(desbloquea C.2–C.7)*
2. **C.1 Coaching accionable** y **C.4 Alertas de riesgo** — bajo esfuerzo, ya casi hecho.
3. **C.5 Biblioteca de mejores llamadas** — bajo esfuerzo, alto valor de onboarding.
4. **C.2 Tendencias por vendedor** y **C.7 Reportes ejecutivos**.
5. **C.3 Gamificación** y **C.6 Calendario**.

En paralelo, la base para todo lo anterior a escala es **A.1 (cola) + A.3 (tablas
de dominio) + auth real**, que además resuelven los hallazgos críticos de seguridad.
