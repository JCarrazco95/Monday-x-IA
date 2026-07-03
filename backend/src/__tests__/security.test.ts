import { describe, it, expect } from "vitest";
import { safeCompare, redactPII, redactLogRow } from "../lib/security.js";

describe("safeCompare", () => {
  it("es verdadero solo con strings idénticos", () => {
    expect(safeCompare("secreto", "secreto")).toBe(true);
    expect(safeCompare("secreto", "secretO")).toBe(false);
    expect(safeCompare("secreto", "secreto2")).toBe(false); // distinta longitud
  });
  it("es falso si falta alguno", () => {
    expect(safeCompare(undefined, "x")).toBe(false);
    expect(safeCompare("x", null)).toBe(false);
    expect(safeCompare(null, null)).toBe(false);
  });
});

describe("redactPII", () => {
  it("enmascara email, rfc y teléfono en cualquier nivel", () => {
    const input = {
      nombre: "Carlos",
      email: "carlos.mendez@construye-mx.com",
      rfc: "CMX950101AB9",
      telefono: "5559876543",
      research: { contacto: { email: "otro@correo.com" } }
    };
    const out = redactPII(input);
    expect(out.nombre).toBe("Carlos");
    expect(out.email).toBe("ca***@***");
    expect(out.rfc).toBe("CM***B9");
    expect(out.telefono).toBe("55***43");
    expect((out.research.contacto as { email: string }).email).toBe("ot***@***");
  });

  it("no altera objetos sin PII", () => {
    const input = { score: 78, prioridad: "caliente" };
    expect(redactPII(input)).toEqual(input);
  });

  it("redactLogRow enmascara el payload JSON y deja intacto lo no-JSON", () => {
    const row = { id: 1, payload: JSON.stringify({ email: "a@b.com", score: 5 }) };
    const masked = JSON.parse(redactLogRow(row).payload);
    expect(masked.email).toBe("a***@***");
    expect(masked.score).toBe(5);

    const noJson = { id: 2, payload: "texto plano" };
    expect(redactLogRow(noJson).payload).toBe("texto plano");
  });
});
