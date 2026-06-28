# Flujo: llamada nueva en Aircall → análisis Sandler automático

Cuando entra un item nuevo al **board de Aircall**, monday llama a nuestro webhook,
el servicio transcribe la grabación, ejecuta el agente Sandler y **escribe el JSON de
vuelta en el item**. La pestaña *Call Intelligence* lo lee y lo muestra.

```
┌──────────────┐  item creado   ┌─────────────────┐  GET recording   ┌──────────┐
│ Board Aircall│ ─────────────► │  Webhook (Node) │ ───────────────► │  monday  │
│  (monday)    │   webhook      │  index.js       │ ◄─────────────── │   API    │
└──────────────┘                └────────┬────────┘   escribe JSON    └──────────┘
                                         │  audio.mp3
                                         ▼
                          ┌──────────────┴──────────────┐
                          │ Whisper (transcribe)         │
                          │ Claude + agente-prompt.md    │ → JSON (esquema-salida.json)
                          └──────────────────────────────┘
```

## 1. Columnas necesarias en el board de Aircall

| Uso | Tipo de columna | Variable .env |
|-----|-----------------|---------------|
| URL del recording (la trae Aircall) | Link o Texto | `COL_RECORDING` |
| Transcript (opcional, si Aircall lo da) | Texto largo | `COL_TRANSCRIPCION` |
| Vendedor (opcional) | Persona / Texto | `COL_VENDEDOR` |
| **JSON del análisis** (lo lee la pestaña) | **Texto largo** | `COL_ANALISIS_JSON` |
| **Puntaje** | **Números** | `COL_SCORE` |
| **Banda** | **Estado/color** con etiquetas `Rojo`,`Amarillo`,`Verde` | `COL_BANDA` |
| Estado del proceso (opcional) | Estado con `Pendiente`,`Analizando`,`Listo`,`Error` | `COL_ESTADO_PROC` |

> Los **IDs** de columna (no los títulos) se ven en *Centro de desarrolladores → API → 
> tu board*, o pasando el cursor sobre la columna → *Configuración → … → ID de la columna*.

## 2. Desplegar el webhook

```bash
cd webhook-handler
cp .env.example .env      # rellena tokens e IDs de columna
npm install
npm start                 # escucha en :8080  →  POST /webhook
```

Necesita una URL pública (monday llama desde internet). Opciones:
- **Pruebas:** `ngrok http 8080` → te da una URL `https://xxxx.ngrok.app`.
- **Producción:** Render, Railway, Cloud Run, una VM, etc. Endpoint = `https://tu-dominio/webhook`.

Tokens a poner en `.env`: `MONDAY_TOKEN` (API v2, perfil → Desarrolladores → My access tokens),
`ANTHROPIC_API_KEY`, y `OPENAI_API_KEY` (solo si transcribes audio).

## 3. Registrar el disparador en monday (elige UNA opción)

**Opción A — Webhook por API (recomendada, dispara en cada item nuevo):**
Ejecuta una vez esta mutación (desde el playground de monday o curl) para suscribir el
evento `create_pulse` del board:

```graphql
mutation {
  create_webhook(
    board_id: TU_BOARD_AIRCALL,
    url: "https://tu-dominio/webhook",
    event: create_pulse
  ) { id board_id }
}
```
monday enviará primero un `challenge`; el handler ya lo responde solo. Listo.

**Opción B — Automatización no-code (si prefieres la UI):**
En el board → *Automatizaciones → Integrar → Webhooks → "Cuando se crea un elemento,
enviar webhook a URL"* → pega `https://tu-dominio/webhook`.
*(Nota: el formato del payload puede variar; el handler ya tolera `create_pulse` y
`create_item`.)*

## 4. Qué hace el handler al recibir el evento

1. Responde `200` de inmediato (monday corta a los ~30 s) y procesa en segundo plano.
2. Lee el item: saca `recording_url` (y transcript si existe).
3. Si no hay transcript → descarga el mp3 y lo transcribe con Whisper (con marcas mm:ss).
4. Llama a Claude con `agente-prompt.md` como system prompt → JSON validado contra
   `esquema-salida.json`.
5. Escribe en el item: `COL_ANALISIS_JSON` (JSON completo), `COL_SCORE`, `COL_BANDA`,
   `COL_ESTADO_PROC=Listo`, y publica un *update* con el resumen y top-3 recomendaciones.
6. La pestaña **Call Intelligence** abre con `?callItemId=<id>` y muestra todo.

## 5. Notas y pendientes

- **URLs de Aircall que expiran:** si el link del recording caduca, transcribe en cuanto
  llega el webhook (así lo hace el flujo) en vez de al abrir la pestaña.
- **Reintentos / idempotencia:** si llega el webhook dos veces, vuelve a analizar y
  sobrescribe; si quieres evitarlo, salta cuando `COL_ESTADO_PROC = Listo`.
- **Costo:** transcripción + 1 llamada al modelo por llamada de venta. Usa
  `claude-sonnet-4-6` por defecto; sube a `claude-opus-4-8` si quieres más precisión.
- **Seguridad:** opcionalmente valida la firma del webhook con `MONDAY_SIGNING_SECRET`.
- Mientras desarrollas con IDs manuales, puedes probar todo el flujo llamando al endpoint
  con un payload simulado:
  ```bash
  curl -X POST https://tu-dominio/webhook -H 'content-type: application/json' \
    -d '{"event":{"type":"create_pulse","boardId":TU_BOARD,"pulseId":TU_ITEM}}'
  ```
