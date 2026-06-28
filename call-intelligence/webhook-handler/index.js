// ===========================================================================
//  MAXIRent · Call Intelligence — Webhook handler
//  Dispara el analisis Sandler cuando entra una llamada nueva al board Aircall.
//  Flujo: monday (item nuevo) -> webhook -> transcribe -> agente -> escribe JSON
// ===========================================================================
import express from 'express';
import { getItem, colText, setColumns, postUpdate } from './monday.js';
import { transcribe, analyze } from './analyze.js';

const app = express();
app.use(express.json({ limit: '2mb' }));

const ENV = process.env;
const BOARD = ENV.AIRCALL_BOARD_ID;

const col = {
  recording: ENV.COL_RECORDING || 'recording',
  transcripcion: ENV.COL_TRANSCRIPCION || '',
  vendedor: ENV.COL_VENDEDOR || '',
  prospecto: ENV.COL_PROSPECTO || '',
  analisis: ENV.COL_ANALISIS_JSON || 'analisis',
  score: ENV.COL_SCORE || 'score',
  banda: ENV.COL_BANDA || 'banda',
  estado: ENV.COL_ESTADO_PROC || ''
};
// Etiquetas del status de color para la columna "banda".
const BANDA_LABEL = { rojo: 'Rojo', amarillo: 'Amarillo', verde: 'Verde' };

app.get('/', (_req, res) => res.send('Call Intelligence webhook OK'));

app.post('/webhook', async (req, res) => {
  const body = req.body || {};
  // 1) Handshake de monday al registrar el webhook.
  if (body.challenge) return res.status(200).json({ challenge: body.challenge });

  const ev = body.event || {};
  // 2) Solo nos interesa "item creado" en el board de Aircall.
  const isCreate = ev.type === 'create_pulse' || ev.type === 'create_item';
  if (!isCreate || String(ev.boardId) !== String(BOARD)) {
    return res.status(200).send('ignorado');
  }
  // 3) Respondemos YA (monday exige <30s) y procesamos en segundo plano.
  res.status(200).send('ok');
  process.nextTick(() => handle(ev.pulseId || ev.itemId).catch(e => console.error('handle:', e)));
});

async function handle(itemId) {
  if (!itemId) return;
  console.log('▶ Procesando item', itemId);
  if (col.estado) await setColumns(BOARD, itemId, { [col.estado]: { label: 'Analizando' } }).catch(() => {});

  try {
    const item = await getItem(itemId);
    const recordingUrl = colText(item, col.recording);
    let transcript = col.transcripcion ? colText(item, col.transcripcion) : '';
    const fuente = transcript ? 'transcripcion' : 'audio';

    if (!transcript) {
      if (!recordingUrl) throw new Error('Item sin transcript ni recording URL.');
      transcript = await transcribe(recordingUrl);
    }

    const meta = {
      id_llamada: String(itemId),
      aircall_item_id: String(itemId),
      vendedor: col.vendedor ? colText(item, col.vendedor) : undefined,
      prospecto: col.prospecto ? colText(item, col.prospecto) : (item && item.name),
      fuente,
      transcripcion_disponible: !!transcript,
      recording_url: recordingUrl || undefined,
      idioma: 'es'
    };

    const data = await analyze({ transcript, meta });

    // 4) Escribe resultados de vuelta en monday.
    const writeback = { [col.analisis]: JSON.stringify(data) };
    if (col.score) writeback[col.score] = data.puntaje_final;
    if (col.banda) writeback[col.banda] = { label: BANDA_LABEL[data.banda] || 'Amarillo' };
    if (col.estado) writeback[col.estado] = { label: 'Listo' };
    await setColumns(BOARD, itemId, writeback);

    // 5) Update legible para el vendedor/manager.
    const top = (data.recomendaciones || []).slice(0, 3)
      .map(r => `• (${r.prioridad}) ${r.accion}`).join('\n');
    await postUpdate(itemId,
      `🎯 Call Intelligence — Puntaje ${data.puntaje_final}/100 (${data.banda}).\n` +
      `Momento clave: ${data.resumen?.momento_clave || '—'}\n\nRecomendaciones:\n${top}`
    ).catch(() => {});

    console.log('✔ Item', itemId, 'analizado:', data.puntaje_final, data.banda);
  } catch (e) {
    console.error('✖ Error item', itemId, e.message);
    if (col.estado) await setColumns(BOARD, itemId, { [col.estado]: { label: 'Error' } }).catch(() => {});
  }
}

const PORT = ENV.PORT || 8080;
app.listen(PORT, () => console.log(`Call Intelligence webhook escuchando en :${PORT}`));
