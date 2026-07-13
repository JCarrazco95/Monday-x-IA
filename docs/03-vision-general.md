# 03 · Visión general del sistema

## Qué es

**MAXIRent × Monday** es una plataforma de inteligencia comercial con agentes de
IA integrada a **Monday.com**, construida para **MAXIRent** (renta de vehículos y
flotillas B2B, Monterrey, México).

Automatiza tres momentos del proceso de venta:

1. **Captación y calificación de leads** — cuando entra un lead (landing, board de
   Monday, o prospección masiva), la IA lo enriquece (sector, tamaño, presencia
   digital, contratos de gobierno), le asigna un **score 0–100** con desglose
   transparente y sugiere la siguiente acción comercial.
2. **Análisis de llamadas de venta** — transcribe la llamada y la evalúa con dos
   metodologías reconocidas, **Sandler** (7 etapas) y **Challenger Sale**, más
   coaching del vendedor y detección de oportunidades de upsell/cross-sell.
3. **Seguimiento que no se olvida** — un agente determinista recorre el histórico y
   levanta alertas: compromisos vencidos, leads calientes enfriándose, llamadas en
   riesgo, y las escribe de vuelta a Monday para que las automatizaciones nativas
   notifiquen al vendedor.
4. **Desarrollo del vendedor** — ranking/insignias por etapa Sandler dominada,
   biblioteca de mejores llamadas y un módulo de **Entrenamiento** (cursos +
   quiz) que recomienda lecciones según la etapa Sandler más débil real de
   cada quien, sin costo de IA.

Todo queda registrado en una **bitácora auditable** y se visualiza en un **panel de
control web** (dashboard, agentes, Call Intelligence, coaching, pipeline, asistente).

## Qué problema resuelve y para quién

| Rol | Problema | Cómo lo resuelve |
|-----|----------|------------------|
| **Vendedor** | Prioriza mal los leads; olvida compromisos; no sabe por qué pierde llamadas | Score y acción recomendada por lead; alertas de seguimiento; coaching accionable tras cada llamada |
| **Gerente de ventas** | No tiene visibilidad del desempeño ni del pipeline | Coaching a nivel equipo, pipeline ponderado por probabilidad, tendencias |
| **Dirección** | Decisiones sin datos | KPIs, forecast, reporte ejecutivo bajo demanda; (roadmap) inteligencia de negocio predictiva |
| **Nuevo vendedor** | Curva de aprendizaje lenta | Biblioteca de mejores llamadas, ranking/insignias por etapa Sandler, y módulo **Entrenamiento** (LMS) con ruta recomendada según su etapa más débil real |

## Cómo se usa

- **Modo demo (sin credenciales):** los agentes generan resultados simulados con
  heurísticas, pero la actividad se registra de verdad. Sirve para probar el panel
  completo sin API keys. Se activa con `AI_PROVIDER=demo` o simplemente sin keys.
- **Modo real:** con `ANTHROPIC_API_KEY` (o `GEMINI_API_KEY`) y `MONDAY_API_TOKEN`,
  los agentes usan IA real y **escriben en el board de Monday**. Opcionalmente
  Aircall + Deepgram para llamadas reales, y fuentes de prospección (Google Places,
  Lusha, licitaciones de gobierno).

## Glosario

- **Lead / item** — un registro en el board de Monday. Su identificador en el
  sistema es `#<itemId> · <nombre>`.
- **Bitácora (`logs`)** — registro histórico de todo lo que hace cada agente; es
  también la fuente desde la que se reconstruyen los análisis.
- **Sandler** — metodología de venta consultiva en 7 etapas (ver [08](08-modelo-datos.md)).
- **Challenger Sale** — metodología basada en enseñar, adaptar y tomar control.
- **Banda** — semáforo del puntaje: verde ≥75, amarillo 50–74, rojo <50.
- **Modo demo / mock** — sin IA/sin Monday reales; heurísticas y respuestas simuladas.

Para el detalle técnico, seguir con [04 · Arquitectura](04-arquitectura.md).
