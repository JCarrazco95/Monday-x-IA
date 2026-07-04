# 12 · Checklist de salida a producción (Fase 1)

Guía paso a paso para pasar de "modo demo" a operar con el tablero real de
MAXIRent. Objetivo: que `GET /api/health` responda
`{"aiProvider":"claude","mondayMode":"live","db":"postgres","auth":"on"}`.

Complementa a [06 · Instalación y despliegue](06-instalacion-despliegue.md) y
[DEPLOY-RENDER.md](DEPLOY-RENDER.md); esta es la lista de verificación operativa.

---

## Paso 0 — Código en GitHub ✅

El repo ya vive en `https://github.com/JCarrazco95/Monday-x-IA`. Solo asegúrate
de que la rama que vas a desplegar tenga el último commit (`git push`).

## Paso 1 — Base de datos durable

- [ ] Crear un Postgres gestionado. Recomendado: **Neon** o **Supabase** (el plan
      free de Render **expira a los 90 días** — no usarlo para el cliente real).
- [ ] Copiar el `DATABASE_URL` (formato `postgresql://user:pass@host:5432/db`).
- [ ] (Recomendado) Descargar el certificado CA del proveedor y guardarlo para
      `DATABASE_CA_CERT` (verificación estricta del SSL).
- [ ] Activar los backups automáticos del proveedor.

## Paso 2 — Deploy en Render (blueprint)

- [ ] Render → New → **Blueprint** → conectar el repo. Crea `maxirent-backend` y
      `maxirent-frontend` desde `render.yaml`.
- [ ] En el **backend**, configurar las variables de entorno:

| Variable | Valor | Nota |
|----------|-------|------|
| `AI_PROVIDER` | `claude` | El blueprint trae `gemini` por defecto (pruebas) — cambiarlo |
| `ANTHROPIC_API_KEY` | `sk-ant-…` | |
| `API_KEY` | una clave larga aleatoria (`openssl rand -hex 32`) | **Activa la autenticación** |
| `CORS_ORIGINS` | `https://maxirent-frontend.onrender.com` (+ dominio de Monday si hay vista embebida) | |
| `DATABASE_URL` | el del Paso 1 | Si usas Neon/Supabase, QUITAR el `fromDatabase` del blueprint |
| `DATABASE_CA_CERT` | PEM del CA (opcional pero recomendado) | |
| `MONDAY_API_TOKEN` | token de API v2 de la cuenta de MAXIRent | Admin → API |
| `MONDAY_BOARD_ID_LEADS` | ID del board de leads | Está en la URL del board |
| `MONDAY_WEBHOOK_SECRET` | signing secret de la app de Monday | NO dejar `changeme` |
| `AIRCALL_API_ID` / `AIRCALL_API_TOKEN` | credenciales de Aircall | Integrations & API |
| `AIRCALL_WEBHOOK_TOKEN` | token que pondrás en el webhook de Aircall | |
| `DEEPGRAM_API_KEY` | solo si se transcribirá audio sin Aircall AI | |
| `CALLS_SYNC_SINCE` | fecha de arranque (ej. `2026-07-15`) | Ignora el histórico viejo |

- [ ] En el **frontend**: `BACKEND_URL` = URL pública del backend, y
      `API_KEY` = el mismo valor que en el backend (Nginx la inyecta server-side
      en el proxy `/api`; no queda en el JS público y se rota sin rebuild).
- [ ] Verificar: `curl https://<backend>/api/health` → `auth:"on"`, `db:"postgres"`,
      `mondayMode:"live"`, `aiProvider:"claude"`.
- [ ] Verificar que sin key la API rechaza: `curl -s -o /dev/null -w "%{http_code}" https://<backend>/api/agents` → `401`.

## Paso 3 — Mapeo de columnas reales del board

Sin esto, el Writer no escribe nada útil en Monday.

- [ ] Listar las columnas reales:
      `curl -H "x-api-key: $API_KEY" "https://<backend>/api/monday/columns"`
- [ ] Construir `MONDAY_COLUMN_MAP` (JSON en una línea) mapeando las claves
      lógicas a los IDs reales. Claves que escriben los agentes:
      - Lead: `score_lead`, `prioridad`, `riesgo`, `perfil_empresa`,
        `accion_recomendada`, `posible_duplicado`, `sectores`,
        `renta_competencia`, `contratos_gobierno`, `necesidad_vehicular`
      - Formulario: `vehiculo_interes`, `duracion_renta`, `tipo_cliente`,
        `urgencia`, `disponible_en_flota`
      - Llamada: `sentimiento_llamada`, `probabilidad_cierre`,
        `vehiculos_mencionados`, `objeciones`, `oportunidad_upsell`, `tipo_oportunidad`
      - NBA: `requiere_atencion`
- [ ] Ejemplo: `MONDAY_COLUMN_MAP={"score_lead":"numeric_abc1","prioridad":"color_xyz2","requiere_atencion":"color_qq3"}`
- [ ] Regla: **lo no mapeado se omite** (no rompe nada); mapear primero 3–4
      columnas clave y ampliar después.
- [ ] Si el webhook no detecta bien las columnas de ENTRADA por título, fijar
      `MONDAY_COL_EMAIL`, `MONDAY_COL_TELEFONO`, `MONDAY_COL_RAZON_SOCIAL`, `MONDAY_COL_RFC`.

## Paso 4 — Webhooks

**Monday (lead creado → análisis automático):**
- [ ] Monday Developers → tu app → Webhooks (o automatización "cuando se cree un
      item → webhook") apuntando a `https://<backend>/api/webhooks/monday`.
- [ ] El handshake (`challenge`) responde solo; verificar en los logs de Render.
- [ ] La firma se valida con `MONDAY_WEBHOOK_SECRET` (el signing secret de la app).

**Aircall (llamada terminada → Call Intelligence):**
- [ ] Aircall → Integrations & API → Webhooks → `https://<backend>/api/webhooks/aircall`,
      eventos `call.ended` y `call.transcription_available`, con el token =
      `AIRCALL_WEBHOOK_TOKEN`.

## Paso 5 — Prueba de fuego (con datos reales)

- [ ] **Lead**: crear un item de prueba en el board → en ~30 s deben aparecer
      score/prioridad en las columnas mapeadas + comentario del agente.
- [ ] **Llamada**: hacer una llamada corta por Aircall → verificarla en la pestaña
      Call Intelligence del panel (o `POST /api/calls/sync-board`).
- [ ] **Bitácora**: revisar que la PII salga enmascarada en `/api/logs`.
- [ ] **Costo**: anotar `GET /api/usage` tras 5–10 leads/llamadas para calibrar el
      costo real por evento (con Haiku 4.5 + prompt caching debería ser centavos).

## Paso 6 — Operación mínima

- [ ] Uptime check sobre `/api/health` (UptimeRobot gratis, cada 5 min — además
      evita que el plan free de Render "duerma").
- [ ] Backups del Postgres activados (Paso 1).
- [ ] `NBA_CRON_HOURS=24` si quieren las alertas de seguimiento diarias.
- [ ] Guardar `API_KEY` y tokens en un gestor de contraseñas (no en chats/correo).

---

**Siguiente fase** al terminar esto: identidad del vendedor por llamada
(desbloquea coaching por vendedor, rankings y biblioteca de mejores llamadas) —
ver [02 · Escalabilidad y roadmap](02-escalabilidad-roadmap.md).
