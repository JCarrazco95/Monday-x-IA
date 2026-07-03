import { describe, it, expect } from "vitest";
import { finalizeScore } from "../agents/leadEnrichmentAgent.js";
import type { LeadEnrichmentOutput, LeadEnrichmentInput } from "../agents/types.js";

function baseResult(overrides: Partial<LeadEnrichmentOutput> = {}): Omit<LeadEnrichmentOutput, "duplicado" | "duplicadoRef"> {
  return {
    score: 0,
    scoreBreakdown: [],
    prioridad: "fria",
    perfilEmpresa: "",
    riesgo: "medio",
    accionRecomendada: "",
    siguientesPasos: [],
    preguntasDiscovery: [],
    riesgosComerciales: [],
    resumen: "",
    ...overrides
  };
}

describe("finalizeScore", () => {
  it("el score final es la suma exacta del desglose", () => {
    const r = baseResult({
      scoreBreakdown: [
        { factor: "a", puntos: 20, max: 30, justificacion: "" },
        { factor: "b", puntos: 30, max: 40, justificacion: "" }
      ]
    });
    finalizeScore(r, { itemId: "1", itemName: "X", nombre: "X", razonSocial: "ACME SA de CV", rfc: "ABC010101AB1" } as LeadEnrichmentInput);
    expect(r.score).toBe(50);
    expect(r.prioridad).toBe("tibia"); // 50-74
    expect(r.riesgo).toBe("medio"); // 45-69
  });

  it("regla dura: sin RFC ni razón social → score ≤ 35, prioridad fría, riesgo alto", () => {
    const r = baseResult({
      scoreBreakdown: [{ factor: "a", puntos: 90, max: 100, justificacion: "" }]
    });
    finalizeScore(r, { itemId: "1", itemName: "X", nombre: "X" } as LeadEnrichmentInput);
    expect(r.score).toBeLessThanOrEqual(35);
    expect(r.prioridad).toBe("fria");
    expect(r.riesgo).toBe("alto");
    expect(r.riesgosComerciales.some((x) => x.includes("RFC ni razón social"))).toBe(true);
  });

  it("score alto con datos fiscales → caliente y riesgo bajo", () => {
    const r = baseResult({
      scoreBreakdown: [{ factor: "a", puntos: 80, max: 100, justificacion: "" }]
    });
    finalizeScore(r, { itemId: "1", itemName: "X", nombre: "X", razonSocial: "ACME SA de CV" } as LeadEnrichmentInput);
    expect(r.score).toBe(80);
    expect(r.prioridad).toBe("caliente");
    expect(r.riesgo).toBe("bajo");
  });
});
