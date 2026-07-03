import { describe, it, expect } from "vitest";
import { parseReference, formatReference, itemIdOf, itemNameOf, safeParseJson } from "../lib/references.js";

describe("references", () => {
  it("formatea y parsea el ida y vuelta", () => {
    const ref = formatReference("123", "Juan García");
    expect(ref).toBe("#123 · Juan García");
    expect(parseReference(ref)).toEqual({ itemId: "123", itemName: "Juan García" });
  });

  it("extrae itemId e itemName por separado", () => {
    const ref = formatReference("aircall-99", "Llamada — Ana");
    expect(itemIdOf(ref)).toBe("aircall-99");
    expect(itemNameOf(ref)).toBe("Llamada — Ana");
  });

  it("tolera un itemName con espacios y guiones", () => {
    const ref = formatReference("4001", "Empresa S.A. de C.V. - Sucursal Norte");
    expect(parseReference(ref).itemName).toBe("Empresa S.A. de C.V. - Sucursal Norte");
  });

  it("devuelve la cadena cruda si no matchea el formato", () => {
    expect(parseReference("scraper-import")).toEqual({
      itemId: "scraper-import",
      itemName: "scraper-import"
    });
  });

  it("safeParseJson devuelve null ante entradas inválidas", () => {
    expect(safeParseJson<{ a: number }>('{"a":1}')).toEqual({ a: 1 });
    expect(safeParseJson(null)).toBeNull();
    expect(safeParseJson("")).toBeNull();
    expect(safeParseJson("no-json")).toBeNull();
  });
});
