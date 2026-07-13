import { describe, it, expect } from "vitest";
import { labelUtterances } from "../lib/transcription.js";

describe("labelUtterances", () => {
  it("etiqueta Vendedor/Cliente por dirección: entrante = contesta el vendedor", () => {
    const out = labelUtterances(
      [
        { speaker: 1, text: "Buenas tardes, gracias por llamar." },
        { speaker: 2, text: "Hola, quería preguntar por una renta." }
      ],
      "inbound"
    );
    expect(out).toBe("Vendedor: Buenas tardes, gracias por llamar.\nCliente: Hola, quería preguntar por una renta.");
  });

  it("etiqueta Vendedor/Cliente por dirección: saliente = contesta el cliente", () => {
    const out = labelUtterances(
      [
        { speaker: "a", text: "Bueno." },
        { speaker: "b", text: "Hola, le hablo de MAXIRent." }
      ],
      "outbound"
    );
    expect(out).toBe("Cliente: Bueno.\nVendedor: Hola, le hablo de MAXIRent.");
  });

  it("sin dirección conocida usa Hablante 1/2 (nunca '?')", () => {
    const out = labelUtterances(
      [
        { speaker: 1, text: "Hola." },
        { speaker: 2, text: "¿Qué tal?" }
      ],
      null
    );
    expect(out).toContain("Hablante 1:");
    expect(out).toContain("Hablante 2:");
    expect(out).not.toContain("?:");
  });

  it("sin speaker_id (undefined) no cae en '?': usa un único 'Hablante'", () => {
    const out = labelUtterances(
      [
        { speaker: undefined, text: "Texto sin diarización." },
        { speaker: undefined, text: "Segunda línea." }
      ],
      "inbound"
    );
    expect(out).toBe("Hablante: Texto sin diarización. Segunda línea.");
    expect(out).not.toContain("?:");
  });

  it("une líneas consecutivas del mismo hablante", () => {
    const out = labelUtterances(
      [
        { speaker: 1, text: "Hola," },
        { speaker: 1, text: "¿cómo está?" },
        { speaker: 2, text: "Bien, gracias." }
      ],
      "inbound"
    );
    expect(out.split("\n")).toHaveLength(2);
    expect(out).toContain("Vendedor: Hola, ¿cómo está?");
  });
});
