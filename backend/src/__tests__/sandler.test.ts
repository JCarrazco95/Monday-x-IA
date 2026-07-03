import { describe, it, expect } from "vitest";
import { banda, SANDLER_ETAPAS } from "../agents/callIntelligenceAgent.js";

describe("banda (semáforo del puntaje)", () => {
  it("verde ≥75, amarillo 50-74, rojo <50", () => {
    expect(banda(75)).toBe("verde");
    expect(banda(90)).toBe("verde");
    expect(banda(74)).toBe("amarillo");
    expect(banda(50)).toBe("amarillo");
    expect(banda(49)).toBe("rojo");
    expect(banda(0)).toBe("rojo");
  });
});

describe("rúbrica Sandler", () => {
  it("las 7 etapas existen y sus pesos suman 100", () => {
    expect(SANDLER_ETAPAS).toHaveLength(7);
    const suma = SANDLER_ETAPAS.reduce((s, e) => s + e.peso, 0);
    expect(suma).toBe(100);
  });

  it("los ids van del 1 al 7 en orden", () => {
    expect(SANDLER_ETAPAS.map((e) => e.id)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });
});
