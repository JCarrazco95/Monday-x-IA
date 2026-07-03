import { describe, it, expect } from "vitest";
import { parseFechaCompromiso } from "../agents/nextBestActionAgent.js";

const NOW = new Date(2026, 6, 3); // 3 de julio de 2026 (mes 6 = julio)

describe("parseFechaCompromiso", () => {
  it("parsea ISO", () => {
    expect(parseFechaCompromiso("entregar el 2026-07-12", NOW)).toEqual(new Date(2026, 6, 12));
  });

  it("parsea dd/mm y dd-mm (asume año actual si falta)", () => {
    expect(parseFechaCompromiso("cita 12/07", NOW)).toEqual(new Date(2026, 6, 12));
    expect(parseFechaCompromiso("cita 12-07-2027", NOW)).toEqual(new Date(2027, 6, 12));
  });

  it("parsea fecha textual en español", () => {
    expect(parseFechaCompromiso("nos vemos el 15 de agosto", NOW)).toEqual(new Date(2026, 7, 15));
    expect(parseFechaCompromiso("el 3 de enero de 2027", NOW)).toEqual(new Date(2027, 0, 3));
  });

  it("devuelve null cuando NO hay fecha concreta", () => {
    expect(parseFechaCompromiso("el viernes", NOW)).toBeNull();
    expect(parseFechaCompromiso("la próxima semana", NOW)).toBeNull();
    expect(parseFechaCompromiso("", NOW)).toBeNull();
    expect(parseFechaCompromiso(null, NOW)).toBeNull();
  });
});
