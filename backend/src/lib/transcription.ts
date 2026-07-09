// ===========================================================================
//  Transcripción de grabaciones (fallback cuando Aircall AI no está disponible).
//
//  Usa Deepgram (DEEPGRAM_API_KEY) sobre la URL de la grabación. Defensivo:
//  si no hay key o falla, devuelve null y el flujo cae a "sin transcripción".
//
//  Diarización con etiquetas legibles: la transcripción se arma desde las
//  `utterances` de Deepgram (cada una trae el índice de hablante). Si se conoce
//  la dirección de la llamada, se etiqueta Vendedor/Cliente con la heurística
//  de quién CONTESTA primero: en una llamada SALIENTE el primer hablante es el
//  cliente; en una ENTRANTE, el vendedor. Sin dirección (o con 3+ hablantes),
//  se usa "Hablante 1/2/…".
// ===========================================================================

const DEEPGRAM_API_KEY = process.env.DEEPGRAM_API_KEY;
const DEEPGRAM_URL =
  process.env.DEEPGRAM_URL ??
  "https://api.deepgram.com/v1/listen?model=nova-2&language=es&smart_format=true&punctuate=true&diarize=true&utterances=true";
const TIMEOUT_MS = Number(process.env.DEEPGRAM_TIMEOUT_MS ?? 30000);

export const transcriptionEnabled = Boolean(DEEPGRAM_API_KEY);

export interface TranscribeOptions {
  /** Dirección de la llamada (de Aircall) para etiquetar Vendedor/Cliente. */
  direction?: "inbound" | "outbound" | string | null;
}

interface DeepgramUtterance {
  speaker?: number;
  transcript?: string;
}

/** Etiquetas por hablante según quién contesta primero (ver cabecera). */
function speakerLabels(utterances: DeepgramUtterance[], direction?: string | null): Map<number, string> {
  const orden: number[] = [];
  for (const u of utterances) {
    const s = u.speaker ?? 0;
    if (!orden.includes(s)) orden.push(s);
  }
  const labels = new Map<number, string>();
  if (orden.length === 2 && (direction === "inbound" || direction === "outbound")) {
    // Saliente: contesta el cliente. Entrante: contesta el vendedor.
    const primero = direction === "outbound" ? "Cliente" : "Vendedor";
    const segundo = direction === "outbound" ? "Vendedor" : "Cliente";
    labels.set(orden[0], primero);
    labels.set(orden[1], segundo);
  } else {
    orden.forEach((s, i) => labels.set(s, `Hablante ${i + 1}`));
  }
  return labels;
}

/** Une utterances consecutivas del mismo hablante en una sola línea. */
function formatUtterances(utterances: DeepgramUtterance[], direction?: string | null): string {
  const labels = speakerLabels(utterances, direction);
  const lines: { speaker: number; text: string }[] = [];
  for (const u of utterances) {
    const text = u.transcript?.trim();
    if (!text) continue;
    const speaker = u.speaker ?? 0;
    const last = lines[lines.length - 1];
    if (last && last.speaker === speaker) last.text += ` ${text}`;
    else lines.push({ speaker, text });
  }
  return lines.map((l) => `${labels.get(l.speaker) ?? "Hablante"}: ${l.text}`).join("\n");
}

/**
 * Transcribe una grabación a partir de su URL. Devuelve el texto con hablantes
 * etiquetados (Vendedor/Cliente si se conoce la dirección) o null si no se pudo.
 */
export async function transcribeRecording(
  recordingUrl?: string | null,
  opts: TranscribeOptions = {}
): Promise<string | null> {
  if (!DEEPGRAM_API_KEY || !recordingUrl) return null;
  try {
    const res = await fetch(DEEPGRAM_URL, {
      method: "POST",
      headers: {
        Authorization: `Token ${DEEPGRAM_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ url: recordingUrl }),
      signal: AbortSignal.timeout(TIMEOUT_MS)
    });
    if (!res.ok) return null;
    const json = (await res.json()) as {
      results?: {
        utterances?: DeepgramUtterance[];
        channels?: {
          alternatives?: {
            transcript?: string;
            paragraphs?: { transcript?: string };
          }[];
        }[];
      };
    };
    // Preferencia: utterances con hablante etiquetado > párrafos > texto plano.
    const utterances = json.results?.utterances;
    if (utterances?.length) {
      const formatted = formatUtterances(utterances, opts.direction);
      if (formatted) return formatted;
    }
    const alt = json.results?.channels?.[0]?.alternatives?.[0];
    return alt?.paragraphs?.transcript || alt?.transcript || null;
  } catch {
    return null;
  }
}
