import { describe, it, expect } from "vitest";
import { looksLikePhone, resolveProspecto } from "../routes/calls.js";

describe("looksLikePhone", () => {
  it("reconoce números con formato típico de Aircall", () => {
    expect(looksLikePhone("+52 81 1911 4124")).toBe(true);
    expect(looksLikePhone("8112345678")).toBe(true);
    expect(looksLikePhone("(81) 1911-4124")).toBe(true);
  });

  it("no confunde un nombre de persona con un teléfono", () => {
    expect(looksLikePhone("Juan Martínez")).toBe(false);
    expect(looksLikePhone("Nadia Mejorado")).toBe(false);
  });

  it("rechaza cadenas cortas o vacías", () => {
    expect(looksLikePhone("")).toBe(false);
    expect(looksLikePhone("123")).toBe(false);
  });
});

describe("resolveProspecto", () => {
  it("reemplaza el teléfono por el nombre del lead si hay coincidencia", () => {
    const leadNames = new Map([["8119114124", "Ricardo Villarreal"]]);
    const out = resolveProspecto("Llamada — +52 81 1911 4124", "+52 81 1911 4124", leadNames);
    expect(out).toBe("Ricardo Villarreal");
  });

  it("deja el nombre del contacto de Aircall si ya venía con nombre", () => {
    const leadNames = new Map([["8119114124", "Ricardo Villarreal"]]);
    const out = resolveProspecto("Llamada — Juan Martínez", "+52 81 1911 4124", leadNames);
    expect(out).toBe("Juan Martínez");
  });

  it("sin coincidencia de lead, conserva el teléfono tal cual", () => {
    const leadNames = new Map<string, string>();
    const out = resolveProspecto("Llamada — +52 81 1911 4124", "+52 81 1911 4124", leadNames);
    expect(out).toBe("+52 81 1911 4124");
  });

  it("sin teléfono asociado, no intenta resolver", () => {
    const leadNames = new Map([["8119114124", "Ricardo Villarreal"]]);
    const out = resolveProspecto("Llamada — +52 81 1911 4124", null, leadNames);
    expect(out).toBe("+52 81 1911 4124");
  });
});
