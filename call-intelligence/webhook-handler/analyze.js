// Transcripcion (si hay audio) + llamada al agente Sandler (Claude) + validacion del JSON.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import Ajv from 'ajv';

const __dirname = dirname(fileURLToPath(import.meta.url));
// El prompt y el esquema viven en la carpeta del proyecto (un nivel arriba).
const SYSTEM_PROMPT = readFileSync(join(__dirname, '..', 'agente-prompt.md'), 'utf8');
const SCHEMA = JSON.parse(readFileSync(join(__dirname, '..', 'esquema-salida.json'), 'utf8'));
const validate = new Ajv({ allErrors: true, strict: false }).compile(SCHEMA);

// ---- 1) Transcripcion del recording (OpenAI Whisper) ----
export async function transcribe(recordingUrl) {
  if ((process.env.TRANSCRIBE_PROVIDER || 'openai') === 'none') return '';
  const audio = await fetch(recordingUrl);
  if (!audio.ok) throw new Error('No se pudo descargar el recording: ' + audio.status);
  const blob = await audio.blob();
  const form = new FormData();
  form.append('file', blob, 'call.mp3');
  form.append('model', process.env.OPENAI_TRANSCRIBE_MODEL || 'whisper-1');
  form.append('language', 'es');
  form.append('response_format', 'verbose_json'); // incluye segmentos con tiempos
  const r = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + process.env.OPENAI_API_KEY },
    body: form
  });
  if (!r.ok) throw new Error('Transcripcion fallo: ' + r.status + ' ' + await r.text());
  const j = await r.json();
  // Texto con marcas de tiempo aproximadas para que el agente cite mm:ss.
  if (Array.isArray(j.segments)) {
    return j.segments.map(s => {
      const mm = String(Math.floor(s.start / 60)).padStart(2, '0');
      const ss = String(Math.floor(s.start % 60)).padStart(2, '0');
      return `[${mm}:${ss}] ${s.text.trim()}`;
    }).join('\n');
  }
  return j.text || '';
}

// ---- 2) Analisis Sandler con Claude ----
export async function analyze({ transcript, meta }) {
  const userMsg =
    `Analiza la siguiente llamada y devuelve SOLO el JSON valido segun el esquema.\n\n` +
    `META:\n${JSON.stringify(meta)}\n\n` +
    `TRANSCRIPCION:\n${transcript || '(no disponible)'}\n`;

  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6',
      max_tokens: 3000,
      temperature: 0,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userMsg }]
    })
  });
  if (!r.ok) throw new Error('Anthropic API: ' + r.status + ' ' + await r.text());
  const j = await r.json();
  let text = (j.content || []).map(c => c.text || '').join('').trim();
  // Por si el modelo envuelve en ```json
  const m = text.match(/\{[\s\S]*\}/);
  if (m) text = m[0];
  const data = JSON.parse(text);

  // Mezcla la meta conocida (ids, url) por si el modelo no la repuso.
  data.meta = Object.assign({}, data.meta, meta);

  if (!validate(data)) {
    console.warn('JSON no valida 100% el esquema:', validate.errors);
    // No abortamos: la UI tolera campos faltantes. Se registra para depurar.
  }
  return data;
}
