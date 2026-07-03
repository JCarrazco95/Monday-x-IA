# 09 · Variables de entorno

Referencia de `backend/.env` (ver `backend/.env.example`) y del webhook-handler.
"Obligatoria" se entiende **para modo producción real**; casi todo es **opcional
en modo demo** (sin keys, el sistema usa heurísticas y mocks).

## Backend (`backend/.env`)

### Servidor
| Variable | Propósito | ¿Obligatoria? |
|----------|-----------|----------------|
| `PORT` | Puerto del backend (def. 4000) | Opcional |
| `NODE_ENV` | Entorno (`development`/`production`) | Opcional |

### Seguridad / operación
| Variable | Propósito | ¿Obligatoria? |
|----------|-----------|----------------|
| `API_KEY` | Si se define, toda la API (menos `/health` y webhooks) exige el header `x-api-key`. Sin ella, la API queda abierta (dev/demo) | Obligatoria (prod) |
| `CORS_ORIGINS` | Lista de orígenes permitidos separados por comas. Sin ella se refleja el origen (dev) | Recomendada (prod) |
| `RATE_LIMIT_API` | Límite general de peticiones por IP / 15 min (def. 1000) | Opcional |
| `RATE_LIMIT_AI` | Límite de endpoints de IA/mutación por IP / 5 min (def. 100) | Opcional |
| `RATE_LIMIT_WEBHOOK` | Límite de webhooks por IP / 5 min (def. 300) | Opcional |
| `CALL_ANALYSIS_CACHE` | `false` desactiva la reutilización del análisis de una llamada ya analizada (por defecto activo, ahorra tokens) | Opcional |
| `AI_MAX_RETRIES` | Reintentos ante errores transitorios de la IA — 429/5xx/timeout (def. 2; `0` desactiva) | Opcional |
| `AI_RETRY_BASE_MS` | Espera base del backoff exponencial entre reintentos (def. 1000 ms) | Opcional |

### Proveedor de IA
| Variable | Propósito | ¿Obligatoria? |
|----------|-----------|----------------|
| `AI_PROVIDER` | Fuerza proveedor: `claude` \| `gemini` \| `demo`. Vacío = autodetecta por keys | Opcional |
| `ANTHROPIC_API_KEY` | Clave de Anthropic (Claude) | Obligatoria si `claude` |
| `CLAUDE_MODEL_DEFAULT` | Modelo por defecto (def. `claude-haiku-4-5`) | Opcional |
| `CLAUDE_MODEL_HEAVY` | Modelo para análisis pesados (llamadas, enriquecimiento) | Opcional |
| `GEMINI_API_KEY` / `GOOGLE_API_KEY` | Clave de Google Gemini (tier gratis para pruebas) | Obligatoria si `gemini` |
| `GEMINI_MODEL_DEFAULT` / `GEMINI_MODEL_HEAVY` | Modelos Gemini (def. `gemini-2.5-flash`) | Opcional |

> Sin ninguna key → modo **demo** (heurísticas, sin red). `/api/health` reporta el modo.

### Monday.com
| Variable | Propósito | ¿Obligatoria? |
|----------|-----------|----------------|
| `MONDAY_API_TOKEN` | Token de API v2. **Sin él, modo mock** (no escribe en Monday) | Obligatoria (real) |
| `MONDAY_API_URL` | Endpoint GraphQL (def. `https://api.monday.com/v2`) | Opcional |
| `MONDAY_BOARD_ID_LEADS` | ID del board de Leads | Obligatoria (real) |
| `MONDAY_WEBHOOK_SECRET` | Signing secret de la app; vacío o `changeme` = **no verifica firma** | Obligatoria (prod) |
| `MONDAY_COL_NOMBRE/EMAIL/TELEFONO/RAZON_SOCIAL/RFC` | IDs de columna de **entrada** (si el match por título no basta) | Opcional |
| `MONDAY_COLUMN_MAP` | JSON clave lógica → ID real de columna de **salida**. Sin él = passthrough (dev/demo); con él, solo escribe lo mapeado | Recomendada (real) |
| `MONDAY_GROUP_PROSPECCION` | Grupo del board para prospectos importados (def. `group_mm4s77d3`) | Opcional |

### Base de datos
| Variable | Propósito | ¿Obligatoria? |
|----------|-----------|----------------|
| `DATABASE_URL` | Postgres gestionado (prod). Presente = usa Postgres; ausente = SQLite | Obligatoria (prod) |
| `DATABASE_PATH` | Ruta del SQLite local (def. `./data/maxirent.db`) | Opcional |
| `DATABASE_CA_CERT` | Certificado CA (PEM) para verificación estricta del SSL de Postgres (evita MITM) | Recomendada (prod) |
| `DATABASE_SSL_STRICT` | `true` fuerza verificación estricta del certificado aunque no haya CA | Opcional |

### Aircall + transcripción
| Variable | Propósito | ¿Obligatoria? |
|----------|-----------|----------------|
| `AIRCALL_API_ID` / `AIRCALL_API_TOKEN` | Credenciales Aircall (llamadas reales) | Opcional |
| `AIRCALL_WEBHOOK_TOKEN` | Token que valida el webhook de Aircall | Opcional |
| `DEEPGRAM_API_KEY` | Transcripción de grabaciones por URL | Opcional |
| `MONDAY_BOARD_ID_CALLS` | Board de llamadas de Aircall en Monday (def. `18398458590`) | Opcional |
| `MONDAY_COL_CALL_ID/LINK/LEAD/DATE` | IDs de columna en ese board (traen defaults reales) | Opcional |
| `CALLS_SYNC_MAX` | Máx. de llamadas nuevas por sincronización (control de costo, def. 25) | Opcional |
| `CALLS_SYNC_SINCE` | ISO: solo analiza llamadas desde esa fecha (ignora histórico) | Opcional |

### Prospección / scraper
| Variable | Propósito | ¿Obligatoria? |
|----------|-----------|----------------|
| `GOOGLE_PLACES_API_KEY` | Google Places (búsqueda de empresas). Sin ella → demo | Opcional |
| `LUSHA_API_KEY` | Lusha (datos B2B con cumplimiento). Sin ella → demo | Opcional |
| `LUSHA_BASE_URL/SEARCH_PATH/ENRICH_PATH/REVEAL` | Ajustes de Lusha (defaults razonables) | Opcional |
| `DIRECTORY_SCRAPER_ENABLED` | Habilita scraping de directorios HTML (def. `false`) | Opcional |
| `GOV_API_URL` / `GOV_API_KEY` | Inteligencia de gobierno (CompraNet/licitaciones) | Opcional |

### Next Best Action y Forecast
| Variable | Propósito | ¿Obligatoria? |
|----------|-----------|----------------|
| `NBA_CRON_HOURS` | Corre el NBA cada N horas y escribe alertas. Vacío = solo bajo demanda | Opcional |
| `NBA_HORAS_CALIENTE/TIBIA/COMPROMISO` | Umbrales de inactividad (def. 24/72/24 h) | Opcional |
| `FORECAST_TICKET_BASE` | Ticket base MXN/mes por oportunidad (def. 25000) | Opcional |
| `FORECAST_MONEDA` | Moneda del forecast (def. `MXN`) | Opcional |

## Webhook-handler (`call-intelligence/webhook-handler/.env`)

| Variable | Propósito | ¿Obligatoria? |
|----------|-----------|----------------|
| `MONDAY_TOKEN` | Token de API v2 de Monday | Sí |
| `AIRCALL_BOARD_ID` | Board donde entran las llamadas de Aircall | Sí |
| `COL_RECORDING` | Columna con la URL del mp3 | Sí |
| `COL_TRANSCRIPCION/VENDEDOR/PROSPECTO` | Columnas de entrada opcionales | Opcional |
| `COL_ANALISIS_JSON/SCORE/BANDA/ESTADO_PROC` | Columnas donde escribe el resultado | Sí (las que uses) |
| `ANTHROPIC_API_KEY` | Clave de Claude | Sí |
| `ANTHROPIC_MODEL` | Modelo (def. `claude-sonnet-4-6`) | Opcional |
| `TRANSCRIBE_PROVIDER` | `openai` \| `none` (none = ya hay transcript) | Opcional |
| `OPENAI_API_KEY` / `OPENAI_TRANSCRIBE_MODEL` | Whisper para transcribir audio | Solo si audio |
| `MONDAY_SIGNING_SECRET` | Firma del webhook para validar origen | Recomendada |
| `PORT` | Puerto (def. 8080) | Opcional |

> **Nota de consistencia:** el webhook-handler usa `MONDAY_TOKEN` mientras el
> backend usa `MONDAY_API_TOKEN`, y por defecto `claude-sonnet-4-6` vs.
> `claude-haiku-4-5` del backend. Ver [01 · §8](01-analisis-tecnico.md).
