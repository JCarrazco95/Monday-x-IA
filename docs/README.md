# Documentación — MAXIRent × Monday

Índice de la documentación del proyecto. Generada tras una revisión completa del
código fuente (backend, frontend, `call-intelligence/webhook-handler`) en modo demo.

## Entregables de la revisión

| Doc | Contenido | Audiencia |
|-----|-----------|-----------|
| [01 · Análisis técnico](01-analisis-tecnico.md) | Hallazgos priorizados (crítico/importante/mejora), con archivo y línea. Arquitectura, seguridad, persistencia, testing, resiliencia, costos. | Dev / tech lead |
| [02 · Escalabilidad y roadmap de producto](02-escalabilidad-roadmap.md) | Multi-tenant, colas, 10×–100×, Fases 4–5, features para desarrollo de vendedores con valor/complejidad. | Dev / dirección |

## Documentación del sistema

| Doc | Contenido | Audiencia |
|-----|-----------|-----------|
| [03 · Visión general](03-vision-general.md) | Qué problema resuelve, para quién, glosario. | Todos |
| [04 · Arquitectura](04-arquitectura.md) | Diagramas Mermaid de los dos flujos (leads y Call Intelligence). | Dev |
| [05 · Referencia de API](05-referencia-api.md) | Todos los endpoints con método, propósito y ejemplo request/response. | Dev / integraciones |
| [06 · Instalación y despliegue](06-instalacion-despliegue.md) | Backend, frontend y webhook-handler en local; despliegue en Render. | Dev / DevOps |
| [07 · Agentes](07-agentes.md) | Rol, modelo, entradas/salidas y relación con columnas de Monday de cada agente. | Dev / negocio |
| [08 · Modelo de datos](08-modelo-datos.md) | Esquema de la BD (`agents`, `logs`, `company_intel`) y `esquema-salida.json`. | Dev |
| [09 · Variables de entorno](09-variables-entorno.md) | Tabla de cada variable, propósito y si es obligatoria u opcional (modo demo). | Dev / DevOps |
| [10 · Estado actual vs. pendientes](10-estado-actual.md) | Qué está implementado, qué es demo, qué quedó fuera de alcance. | Todos |
| [11 · Correcciones aplicadas](11-correcciones.md) | Resumen de los arreglos de seguridad, robustez, calidad y costo implementados sobre el análisis técnico. | Dev / dirección |
| [12 · Checklist de deploy](12-checklist-deploy.md) | Lista de verificación paso a paso para salir a producción real (BD, Render, columnas, webhooks, prueba de fuego). | Dev / operación |

## Documentos previos (conservados)

- [DEPLOY-RENDER.md](DEPLOY-RENDER.md) — guía original de despliegue en Render.
- [DESPLIEGUE-MONDAY.md](DESPLIEGUE-MONDAY.md) — guía original de integración con Monday.

> Los docs 06 y 05 consolidan e integran lo que antes estaba repartido entre el
> `README.md` raíz, `call-intelligence/flujo-aircall-trigger.md` y los dos docs previos.
