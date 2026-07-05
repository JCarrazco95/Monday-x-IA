import { describe, it, expect } from "vitest";
import { buildCoachingComment } from "../lib/coachingComment.js";
import type { CallIntelligenceOutput, SandlerStage } from "../agents/types.js";

function etapa(id: number, nombre: string, puntaje: number): SandlerStage {
  return { id, nombre, peso: 15, puntaje, estado: puntaje >= 50 ? "parcial" : "deficiente", aciertos: [], fallos: [], evidencia: [] };
}

function baseCall(overrides: Partial<CallIntelligenceOutput> = {}): CallIntelligenceOutput {
  return {
    resumen: "r",
    vehiculosMencionados: [],
    fechasMencionadas: [],
    compromisos: [],
    objeciones: [],
    sentimiento: "neutro",
    probabilidadCierre: "media",
    vendedorNombre: "Nadia López",
    sandler: {
      puntajeFinal: 62,
      banda: "amarillo",
      etapas: [etapa(1, "Vínculo", 80), etapa(3, "Dolor", 40)],
      fortalezas: [],
      areasMejora: [],
      recomendaciones: []
    },
    challenger: { score: 55, banda: "amarillo", perfilVendedor: "hard_worker", dimensiones: [], fortalezas: [], areasMejora: [], insightSugerido: "", reframeSugerido: "", siguientePaso: "" },
    integrado: { scoreGlobal: 59, banda: "amarillo", resumenEjecutivo: "", diagnostico: "", fortalezasClave: [], riesgos: [], planAccion: [], proximaLlamada: "Validar presupuesto con finanzas." },
    vendedor: {
      desempenoGeneral: "",
      puntosClave: [],
      fallos: [],
      mejoras: [
        { area: "Dolor", accion: "Profundizar 3 niveles", ejemploFrase: "¿Qué pasa hoy que lo hace urgente?", prioridad: "alta" },
        { area: "Cierre", accion: "Up-front contract", prioridad: "media" }
      ],
      habilidades: [],
      estiloComunicacion: ""
    },
    ...overrides
  };
}

describe("buildCoachingComment", () => {
  it("incluye vendedor, score, etapa débil, mejoras con frase y próxima llamada", () => {
    const c = buildCoachingComment(baseCall());
    expect(c).toBeTruthy();
    expect(c).toContain("Nadia López");
    expect(c).toContain("59/100");
    expect(c).toContain("Etapa a trabajar: Dolor (40/100)");
    expect(c).toContain("[alta] Profundizar 3 niveles");
    expect(c).toContain("¿Qué pasa hoy que lo hace urgente?");
    expect(c).toContain("Próxima llamada: Validar presupuesto");
  });

  it("devuelve null para llamadas no evaluables (buzón, score 0)", () => {
    const call = baseCall();
    call.sandler!.puntajeFinal = 0;
    expect(buildCoachingComment(call)).toBeNull();
  });

  it("devuelve null sin material accionable (sin mejoras ni próxima llamada)", () => {
    const call = baseCall();
    call.vendedor!.mejoras = [];
    call.integrado!.proximaLlamada = "";
    expect(buildCoachingComment(call)).toBeNull();
  });
});
