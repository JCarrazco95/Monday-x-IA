# 07 · Descripción de cada agente

Todos los agentes viven en `backend/src/agents/`. Comparten la tabla `agents`
(estado `active`/`paused`, modelo, herramientas) salvo donde se indica. El
**Orchestrator** los invoca; el **Monday Writer** materializa sus resultados.

Modelo por defecto: `claude-haiku-4-5` (configurable con `CLAUDE_MODEL_DEFAULT` /
`CLAUDE_MODEL_HEAVY`; en modo gemini, `gemini-2.5-flash`). En modo demo cada agente
usa una función heurística (`mockFn`) sin red.

---

## Orchestrator Agent (`orchestratorAgent.ts`)
- **Rol:** punto único de entrada. Enruta el evento al agente correcto por
  `eventType`, traduce su salida a `MondayWriteInput` con **claves lógicas fijas** y
  delega la escritura al Writer. Registra cada paso en la bitácora.
- **Entradas:** `OrchestratorEvent { eventType, item, payload }`.
- **Salidas:** `{ skipped, writeInput, writeResult }`.
- **Relación con Monday:** define qué columnas lógicas se escriben por tipo de
  evento (ver tablas abajo). No llama a Monday directamente.

---

## Form Analysis Agent (`formAnalysisAgent.ts`) — Prioridad 1
- **Rol:** analiza respuestas de un formulario de cotización.
- **Modelo:** `MODEL_DEFAULT`.
- **Entradas:** `FormAnalysisInput { itemId, itemName, formResponses }`.
- **Salidas (`FormAnalysisOutput`):** `vehiculoInteres`, `duracionRenta`,
  `tipoCliente` (personal/empresarial), `urgencia` (baja/media/alta),
  `disponibleEnFlota`, `plantillaRespuesta`, `resumen`.
- **Columnas de Monday escritas:** `vehiculo_interes`, `duracion_renta`,
  `tipo_cliente`, `urgencia`, `disponible_en_flota` + comentario con la plantilla.
- **Nota:** `disponibleEnFlota` se valida contra una **lista hardcodeada** de flota
  (`formAnalysisAgent.ts:6`); la Fase 4 la conectaría al inventario real.

---

## Lead Enrichment Agent (`leadEnrichmentAgent.ts`) — Prioridad 2
- **Rol:** califica y enriquece un lead. Detecta duplicados, calcula un **score
  0–100** con desglose transparente por rúbrica (7 factores, suman 100), investiga
  la empresa (web/CompraNet) y arma un playbook de venta.
- **Modelo:** `MODEL_HEAVY`. En modo live hace **`webResearch`** (hasta 6
  búsquedas) + `structuredCompletion`. Cachea la investigación por empresa en
  `company_intel`.
- **Entradas:** `LeadEnrichmentInput { nombre, email?, telefono?, razonSocial?, rfc? }`.
- **Salidas (`LeadEnrichmentOutput`):** `score`, `scoreBreakdown[]`, `prioridad`
  (caliente/tibia/fria), `riesgo`, `perfilEmpresa`, `accionRecomendada`,
  `siguientesPasos[]`, `preguntasDiscovery[]`, `riesgosComerciales[]`, `research`
  (sectores, presencia digital, gobierno, competencia, argumentario, fuentes),
  `fuenteAnalisis` (web/modelo/demo), `duplicado`/`duplicadoRef`.
- **Regla dura:** sin RFC ni razón social → score ≤ 35, prioridad fría, riesgo alto.
- **Columnas de Monday escritas:** `score_lead`, `prioridad`, `riesgo`,
  `perfil_empresa`, `accion_recomendada`, `posible_duplicado`, y si hay research:
  `sectores`, `renta_competencia`, `contratos_gobierno`, `necesidad_vehicular` +
  comentario extenso con el desglose.

---

## Call Intelligence Agent (`callIntelligenceAgent.ts`) — Prioridad 3
- **Rol:** analiza la transcripción de una llamada con **cinco análisis**,
  ejecutados en **2 pasadas consolidadas** a la IA (para reducir tokens):
  1. **Sandler** — 7 etapas con peso/puntaje/estado/aciertos/fallos/evidencia.
  2. **Challenger Sale** — 6 dimensiones, perfil del vendedor, insight/reframe.
  3. **Integrado** — fusiona ambos: `scoreGlobal`, resumen ejecutivo, plan de acción.
  4. **Coaching del vendedor + análisis profundo** — habilidades, fallos con
     impacto, mejoras con frases, timeline de momentos, señales de compra, banderas rojas.
  5. **Oportunidades** — upsell/cross-sell (expansión de flota, renovación, upgrade,
     servicios, vehículo adicional).
- **Modelo:** `MODEL_HEAVY` en ambas pasadas.
- **Entradas:** `CallIntelligenceInput { transcript, audioUrl?, telefono? }`.
- **Salidas (`CallIntelligenceOutput`):** básicos (resumen, vehículos, fechas,
  compromisos, objeciones, sentimiento, probabilidadCierre) + `sandler` +
  `challenger` + `integrado` + `vendedor` + `analisisProfundo` + `oportunidades`.
- **Columnas de Monday escritas:** `sentimiento_llamada`, `probabilidad_cierre`,
  `vehiculos_mencionados`, `objeciones`, `oportunidad_upsell`, `tipo_oportunidad`;
  cada compromiso se crea como **subitem**; comentario con resumen y oportunidades.
- **⚠️ Procedencia:** a diferencia del lead, la salida de llamada **no** marca si
  vino de un fallback demo por error (ver [01 · I3](01-analisis-tecnico.md)).

---

## Next Best Action Agent (`nextBestActionAgent.ts`) — Prioridad 4
- **Rol:** "el supervisor que nunca olvida". **Determinista (sin IA).** Recorre la
  bitácora y levanta alertas: compromisos sin seguimiento/vencidos, leads
  calientes/tibios enfriándose, llamadas con banderas rojas.
- **Modelo:** `deterministic`.
- **Entradas:** ninguna (lee `logs`). Opciones `{ now?, write? }`.
- **Salidas (`NextBestActionReport`):** `acciones[]` con tipo/prioridad/motivo/
  acciónSugerida, `porPrioridad`, `itemsRevisados`.
- **Relación con Monday:** en `write:true` escribe la columna `requiere_atencion`
  (Sí) + un comentario consolidado en los items con alerta de alta prioridad, para
  que las **automatizaciones nativas** de Monday notifiquen al vendedor.
- **Cron:** opcional cada `NBA_CRON_HOURS`. Umbrales: `NBA_HORAS_CALIENTE/TIBIA/COMPROMISO`.

---

## Lead Scraper Agent (`leadScraperAgent.ts`) — prospección
- **Rol:** prospección y alta masiva de leads desde fuentes conectables
  (`lib/leadSources.ts`): Google Places, licitaciones de gobierno, Lusha,
  directorios web. `searchProspects` (preview, no escribe) y `importProspects`
  (alta reusando el flujo `lead_created`).
- **Dedupe:** a dos niveles (contra nombres en la bitácora + dentro del lote); el
  Lead Enrichment también detecta duplicados en el board.
- **Relación con Monday:** crea los items en el grupo `MONDAY_GROUP_PROSPECCION` y
  dispara el enriquecimiento completo.
- **Nota:** este agente **no** tiene fila en la tabla `agents` (no lo siembra el
  seed), aunque deja logs con `agent_id:"lead_scraper"` — ver [01 · §8](01-analisis-tecnico.md).

---

## Monday Writer Agent (`mondayWriterAgent.ts`) — soporte
- **Rol:** único agente que escribe en Monday. Recibe `MondayWriteInput` y aplica
  columnas, subitems y comentario vía GraphQL.
- **Mapa de columnas:** `MONDAY_COLUMN_MAP` traduce clave lógica → ID real. Con mapa
  configurado, **solo** escribe lo mapeado (omite el resto para no disparar
  automatizaciones ajenas); sin mapa, passthrough (dev/demo).
- **Guarda:** no escribe si el `itemId` no es numérico (análisis de llamadas con id
  `aircall-…`/`url-…`/`call-…` se guardan solo en la bitácora).
- **Modo mock:** sin `MONDAY_API_TOKEN` no llama a Monday pero registra qué habría escrito.

### Resumen: columnas de Monday por tipo de evento

| Evento | Columnas lógicas escritas |
|--------|---------------------------|
| `form_submitted` | `vehiculo_interes`, `duracion_renta`, `tipo_cliente`, `urgencia`, `disponible_en_flota` |
| `lead_created` | `score_lead`, `prioridad`, `riesgo`, `perfil_empresa`, `accion_recomendada`, `posible_duplicado`, `sectores`, `renta_competencia`, `contratos_gobierno`, `necesidad_vehicular` |
| `call_recorded` | `sentimiento_llamada`, `probabilidad_cierre`, `vehiculos_mencionados`, `objeciones`, `oportunidad_upsell`, `tipo_oportunidad` (+ subitems por compromiso) |
| NBA (alta prio) | `requiere_atencion` |

Todas requieren su ID real en `MONDAY_COLUMN_MAP` para escribirse en producción.
