// ===========================================================================
//  Transcripción de grabaciones (fallback cuando Aircall AI no está disponible).
//
//  Usa Deepgram (DEEPGRAM_API_KEY) sobre la URL de la grabación. Defensivo:
//  si no hay key o falla, devuelve null y el flujo cae a "sin transcripción".
//
//  Alternativa: OpenAI Whisper. Aquí implementamos Deepgram por simplicidad
//  (un solo POST con la URL del audio).
// ===========================================================================

const DEEPGRAM_API_KEY = process.env.DEEPGRAM_API_KEY;
const DEEPGRAM_URL =
  process.env.DEEPGRAM_URL ??
  "https://api.deepgram.com/v1/listen?model=nova-2&language=es&smart_format=true&punctuate=true&diarize=true";
const TIMEOUT_MS = Number(process.env.DEEPGRAM_TIMEOUT_MS ?? 30000);

export const transcriptionEnabled = Boolean(DEEPGRAM_API_KEY);

/**
 * Transcribe una grabación a partir de su URL. Devuelve el texto (con
 * diarización si Deepgram la provee) o null si no se pudo.
 */
export async function transcribeRecording(recordingUrl?: string | null): Promise<string | null> {
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
        channels?: {
          alternatives?: {
            transcript?: string;
            paragraphs?: { transcript?: string };
          }[];
        }[];
      };
    };
    const alt = json.results?.channels?.[0]?.alternatives?.[0];
    return alt?.paragraphs?.transcript || alt?.transcript || null;
  } catch {
    return null;
  }
}
