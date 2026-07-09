import { Router } from "express";
import { db } from "../db/index.js";
import { structuredCompletion, MODEL_HEAVY } from "../lib/claude.js";
import { is429 } from "../lib/retry.js";
import { parseReference, safeParseJson } from "../lib/references.js";
import type { LeadEnrichmentOutput, CallIntelligenceOutput } from "../agents/types.js";

// ===========================================================================
//  Asistente comercial (Chat RAG sobre la bitácora).
//
//  "Habla con tus leads": responde preguntas comerciales en lenguaje natural
//  usando como contexto el histórico de análisis (logs). Flujo RAG simple:
//   1) Reconstruye un "documento" compacto por lead/llamada desde `logs`.
//   2) Recupera los documentos más relevantes a la pregunta (overlap de términos).
//   3) Le pasa ESE contexto al modelo (claude/gemini) para que responda citando.
//  En modo demo (sin IA) responde con un resumen determinista de lo recuperado.
// ===========================================================================

export const assistantRouter = Router();

interface LogRow {
  reference: string;
  agent_id: string;
  payload: string | null;
  timestamp: string;
}

interface Doc {
  itemId: string;
  itemName: string;
  texto: string;       // documento para recuperar y citar
  ts: string | null;
}

const STOP = new Set([
  "el","la","los","las","un","una","unos","unas","de","del","al","a","en","y","o","u","que","con","por","para",
  "se","su","sus","lo","es","son","fue","han","ha","me","mi","te","tu","como","cual","cuales","quien","quienes",
  "donde","cuando","cuanto","cuantos","cuantas","este","esta","estos","estas","esos","esas","mas","menos","muy",
  "todo","todos","toda","todas","hay","tiene","tienen","sobre","dame","muestrame","cuales","leads","lead","llamadas",
  "llamada","cliente","clientes","empresa","empresas"
]);

function norm(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}
function tokens(s: string): string[] {
  return norm(s).replace(/[^a-z0-9ñ\s]/g, " ").split(/\s+/).filter((w) => w.length > 2 && !STOP.has(w));
}

// Construye un documento de texto por item (lead + llamada + form), leyendo
// las TABLAS DE DOMINIO (A.3) en vez de reconstruir desde logs.
async function buildCorpus(): Promise<Doc[]> {
  const byRef = new Map<string, { itemId: string; itemName: string; lead: LeadEnrichmentOutput | null; call: CallIntelligenceOutput | null; ts: string | null }>();

  const leadRows = await db.query<{ item_id: string; item_name: string; lead_payload: string | null; analyzed_at: string }>(
    `SELECT item_id, item_name, lead_payload, analyzed_at FROM lead_analyses`
  );
  for (const r of leadRows) {
    byRef.set(r.item_id, {
      itemId: r.item_id,
      itemName: r.item_name,
      lead: safeParseJson<LeadEnrichmentOutput>(r.lead_payload),
      call: null,
      ts: r.analyzed_at
    });
  }

  const callRows = await db.query<{ item_id: string; item_name: string; payload: string; analyzed_at: string }>(
    `SELECT item_id, item_name, payload, analyzed_at FROM call_analyses`
  );
  for (const r of callRows) {
    const cur = byRef.get(r.item_id) ?? { itemId: r.item_id, itemName: r.item_name, lead: null, call: null, ts: null };
    cur.call = safeParseJson<CallIntelligenceOutput>(r.payload);
    cur.ts = r.analyzed_at;
    byRef.set(r.item_id, cur);
  }

  const docs: Doc[] = [];
  for (const [, s] of byRef) {
    const { itemId, itemName } = s;
    const L = s.lead;
    const C = s.call;
    const partes: string[] = [`Lead: ${itemName}.`];
    if (L) {
      partes.push(`Score ${L.score}/100, prioridad ${L.prioridad}, riesgo ${L.riesgo}.`);
      if (L.perfilEmpresa) partes.push(`Perfil: ${L.perfilEmpresa}.`);
      if (L.research?.sectores?.length) partes.push(`Sectores: ${L.research.sectores.join(", ")}.`);
      if (L.research?.necesidadVehicular) partes.push(`Necesidad: ${L.research.necesidadVehicular}.`);
      if (L.research?.gobierno?.tieneContratos) partes.push(`Tiene contratos de gobierno.`);
      if (L.research?.rentaOtrasMarcas?.detectado) partes.push(`Renta con competencia.`);
      if (L.riesgosComerciales?.length) partes.push(`Riesgos: ${L.riesgosComerciales.join("; ")}.`);
      if (L.resumen) partes.push(L.resumen);
    }
    if (C) {
      partes.push(`Llamada: sentimiento ${C.sentimiento}, probabilidad de cierre ${C.probabilidadCierre}.`);
      if (C.vehiculosMencionados?.length) partes.push(`Vehículos: ${C.vehiculosMencionados.join(", ")}.`);
      if (C.objeciones?.length) partes.push(`Objeciones: ${C.objeciones.join("; ")}.`);
      if (C.analisisProfundo?.banderasRojas?.length) partes.push(`Banderas rojas: ${C.analisisProfundo.banderasRojas.join("; ")}.`);
      if (C.compromisos?.length) partes.push(`Compromisos: ${C.compromisos.map((x) => x.descripcion).join("; ")}.`);
      if (C.oportunidades?.hayOportunidad) partes.push(`Oportunidades: ${C.oportunidades.senales.map((x) => x.tipo).join(", ")}.`);
      if (C.integrado?.resumenEjecutivo) partes.push(C.integrado.resumenEjecutivo);
    }
    docs.push({ itemId, itemName, texto: partes.join(" ").slice(0, 800), ts: s.ts });
  }
  return docs;
}

// Quita documentos con el mismo nombre (sims repetidas), dejando el más reciente.
function dedupByName(scored: { doc: Doc; score: number }[]): { doc: Doc; score: number }[] {
  const seen = new Set<string>();
  const out: { doc: Doc; score: number }[] = [];
  for (const s of scored) {
    const key = s.doc.itemName.toLowerCase().trim();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(s);
  }
  return out;
}

// Recupera los documentos más relevantes por solapamiento de términos.
function retrieve(docs: Doc[], question: string, k = 8): { doc: Doc; score: number }[] {
  const qTerms = [...new Set(tokens(question))];
  if (!qTerms.length) {
    // Sin términos útiles: devuelve los más recientes.
    const recientes = [...docs].sort((a, b) => (b.ts ?? "").localeCompare(a.ts ?? "")).map((doc) => ({ doc, score: 0 }));
    return dedupByName(recientes).slice(0, k);
  }
  const scored = docs
    .map((doc) => {
      const hay = norm(doc.texto);
      let score = 0;
      for (const t of qTerms) {
        const matches = hay.split(t).length - 1;
        if (matches) score += 1 + Math.min(matches - 1, 2) * 0.25;
      }
      return { doc, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);
  return dedupByName(scored).slice(0, k);
}

const SYSTEM = `Eres el asistente comercial de MAXIRent (renta de flotillas en México). Respondes preguntas del equipo de
ventas/dirección usando EXCLUSIVAMENTE el CONTEXTO proporcionado (extractos del histórico de leads y llamadas analizadas).
Reglas:
- No inventes datos que no estén en el contexto. Si el contexto no alcanza, dilo y sugiere qué simular/analizar.
- Sé concreto y accionable; cuando menciones un lead/llamada, nómbralo.
- Responde en español, breve y directo (viñetas si ayuda).
- En "itemsCitados" lista los nombres EXACTOS de los leads/llamadas que respaldan tu respuesta.
Responde con la herramienta "respuesta_asistente".`;

const SCHEMA: Record<string, unknown> = {
  type: "object",
  properties: {
    respuesta: { type: "string" },
    itemsCitados: { type: "array", items: { type: "string" } }
  },
  required: ["respuesta", "itemsCitados"]
};

// Respuesta determinista para modo demo (sin IA): resume lo recuperado.
function mockAnswer(question: string, top: { doc: Doc; score: number }[]): { respuesta: string; itemsCitados: string[] } {
  if (!top.length) {
    return {
      respuesta:
        `No encontré coincidencias en el histórico para "${question}". Analiza o simula más leads/llamadas y vuelve a preguntar. (modo demo, sin IA)`,
      itemsCitados: []
    };
  }
  const lineas = top.slice(0, 6).map((t) => `• ${t.doc.itemName}: ${t.doc.texto.slice(0, 180)}…`);
  return {
    respuesta:
      `Esto es lo más relevante del histórico para tu pregunta (modo demo, sin IA — conecta un proveedor para respuestas redactadas):\n\n${lineas.join("\n")}`,
    itemsCitados: top.slice(0, 6).map((t) => t.doc.itemName)
  };
}

// POST /api/assistant/chat  { question }
assistantRouter.post("/chat", async (req, res) => {
  const question = String(req.body?.question ?? "").trim();
  if (!question) return res.status(400).json({ error: "Falta 'question'." });

  try {
    const docs = await buildCorpus();
    if (!docs.length) {
      return res.json({
        respuesta: "Aún no hay histórico para consultar. Analiza o simula leads y llamadas primero.",
        itemsCitados: [],
        contexto: []
      });
    }

    const top = retrieve(docs, question);
    const contextoTexto = top.map((t, i) => `[${i + 1}] ${t.doc.itemName}\n${t.doc.texto}`).join("\n\n");

    const result = await structuredCompletion<{ respuesta: string; itemsCitados: string[] }>({
      system: SYSTEM,
      model: MODEL_HEAVY,
      prompt: `CONTEXTO (extractos del histórico de MAXIRent):\n"""\n${contextoTexto || "(sin coincidencias)"}\n"""\n\nPregunta del usuario: ${question}\n\nResponde solo con base en el contexto.`,
      toolName: "respuesta_asistente",
      toolDescription: "Respuesta del asistente comercial basada en el histórico.",
      inputSchema: SCHEMA,
      mockFn: () => mockAnswer(question, top),
      // Chat interactivo: fallar rápido (un reintento corto) en vez de dejar al
      // usuario esperando 60s+; el 503 de abajo explica el porqué.
      retryOpts: { retries: 1, floor429Ms: 4000 }
    });

    res.json({
      respuesta: result.respuesta,
      itemsCitados: result.itemsCitados ?? [],
      contexto: top.map((t) => ({ itemId: t.doc.itemId, itemName: t.doc.itemName }))
    });
  } catch (err) {
    // Cuota de IA agotada: mensaje claro y accionable (no un 504 críptico ni
    // una respuesta demo disfrazada de real).
    if (is429(err)) {
      return res.status(503).json({
        error:
          "La cuota del proveedor de IA está agotada por ahora (tier gratuito). " +
          "Intenta de nuevo en unos minutos, o sube el plan del proveedor para eliminar el límite."
      });
    }
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});
