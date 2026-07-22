import * as XLSX from "xlsx";

// ===========================================================================
//  Exportación de reportes (CSV / XLS) desde datos YA cargados en el cliente
//  (Pipeline ya trae todas las oportunidades a memoria, así que exportar es
//  puramente client-side — sin endpoint nuevo, exporta exactamente lo que el
//  usuario está viendo/filtrando en pantalla).
// ===========================================================================

/** Descarga un arreglo de objetos plano como CSV. */
export function exportToCsv(filename: string, rows: Record<string, unknown>[]): void {
  const ws = XLSX.utils.json_to_sheet(rows);
  const csv = XLSX.utils.sheet_to_csv(ws);
  // BOM para que Excel/Windows reconozca UTF-8 (acentos, ñ) sin abrir con caracteres rotos.
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
  downloadBlob(blob, `${filename}.csv`);
}

/** Descarga un arreglo de objetos plano como .xlsx (una sola hoja). */
export function exportToXlsx(filename: string, rows: Record<string, unknown>[], sheetName = "Datos"): void {
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  XLSX.writeFile(wb, `${filename}.xlsx`);
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
