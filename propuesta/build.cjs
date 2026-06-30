const fs = require("fs");
const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, ImageRun,
  Header, Footer, AlignmentType, LevelFormat, TabStopType, TabStopPosition,
  TableOfContents, HeadingLevel, BorderStyle, WidthType, ShadingType,
  VerticalAlign, PageNumber, PageBreak
} = require("docx");

// ---------- Paleta ----------
const NAVY = "0B2C5B", BLUE = "1462B4", BLUE2 = "1F7FD6", TEAL = "14B8A6";
const GRAY = "475569", MUTED = "64748B", GREEN = "1FA971", AMBER = "E0922F", RED = "E2483D";
const FILL_HEAD = "0B2C5B", FILL_SUB = "D6E4F2", FILL_LITE = "F1F5F9", FILL_GREEN = "E7F6EF", FILL_AMBER = "FBF1E3";
const CONTENT = 9360;

// ---------- Helpers ----------
const fmt = (n) => "$" + Math.round(n).toLocaleString("en-US") + " MXN";
const fmt0 = (n) => Math.round(n).toLocaleString("en-US");

function t(text, o = {}) { return new TextRun({ text, font: "Arial", ...o }); }
function p(children, o = {}) { return new Paragraph({ children: Array.isArray(children) ? children : [children], spacing: { after: 120, line: 276 }, ...o }); }
function body(text, o = {}) { return p([t(text, o.run || {})], { spacing: { after: 140, line: 288 }, ...o }); }
function h1(text) { return new Paragraph({ heading: HeadingLevel.HEADING_1, children: [t(text)] }); }
function h2(text) { return new Paragraph({ heading: HeadingLevel.HEADING_2, children: [t(text)] }); }
function h3(text) { return new Paragraph({ heading: HeadingLevel.HEADING_3, children: [t(text)] }); }
function bullet(runs) { return new Paragraph({ numbering: { reference: "bul", level: 0 }, spacing: { after: 80, line: 276 }, children: Array.isArray(runs) ? runs : [t(runs)] }); }
function numItem(runs) { return new Paragraph({ numbering: { reference: "num", level: 0 }, spacing: { after: 80, line: 276 }, children: Array.isArray(runs) ? runs : [t(runs)] }); }
function spacer(h = 120) { return new Paragraph({ spacing: { after: h }, children: [t("")] }); }

const B = { style: BorderStyle.SINGLE, size: 1, color: "D5DCE6" };
const BORD = { top: B, bottom: B, left: B, right: B };
const CM = { top: 70, bottom: 70, left: 120, right: 120 };

function cell(content, { w, fill, bold, color, align, vAlign, size } = {}) {
  const runs = Array.isArray(content) ? content : [t(String(content), { bold, color, size })];
  return new TableCell({
    borders: BORD, width: { size: w, type: WidthType.DXA },
    margins: CM, verticalAlign: vAlign || VerticalAlign.CENTER,
    shading: fill ? { fill, type: ShadingType.CLEAR } : undefined,
    children: [new Paragraph({ alignment: align || AlignmentType.LEFT, spacing: { after: 0, line: 264 }, children: runs })]
  });
}
function headerRow(labels, widths, fill = FILL_HEAD) {
  return new TableRow({ tableHeader: true, children: labels.map((l, i) =>
    cell(l, { w: widths[i], fill, bold: true, color: "FFFFFF", align: i === 0 ? AlignmentType.LEFT : AlignmentType.CENTER })) });
}
function row(cells, widths, opts = {}) {
  return new TableRow({ children: cells.map((c, i) => {
    if (c && c.__cell) return cell(c.v, { w: widths[i], ...c });
    return cell(c, { w: widths[i], align: i === 0 ? AlignmentType.LEFT : AlignmentType.CENTER, fill: opts.fill, bold: opts.bold, color: opts.color });
  }) });
}
function table(widths, rows) {
  return new Table({ width: { size: widths.reduce((a, b) => a + b, 0), type: WidthType.DXA }, columnWidths: widths, rows });
}

// Caja de llamada (callout) — párrafo con borde y relleno
function callout(title, lines, { fill = FILL_GREEN, bar = GREEN } = {}) {
  return new Table({
    width: { size: CONTENT, type: WidthType.DXA }, columnWidths: [CONTENT],
    rows: [ new TableRow({ children: [ new TableCell({
      width: { size: CONTENT, type: WidthType.DXA },
      shading: { fill, type: ShadingType.CLEAR },
      margins: { top: 140, bottom: 140, left: 200, right: 200 },
      borders: { left: { style: BorderStyle.SINGLE, size: 24, color: bar }, top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE } },
      children: [
        new Paragraph({ spacing: { after: lines.length ? 90 : 0 }, children: [t(title, { bold: true, color: NAVY, size: 24 })] }),
        ...lines.map((ln, i) => new Paragraph({ spacing: { after: i === lines.length - 1 ? 0 : 60, line: 276 }, children: Array.isArray(ln) ? ln : [t(ln, { color: GRAY })] }))
      ]
    }) ] }) ]
  });
}

// ---------- Logos ----------
const analysys = fs.readFileSync("assets/analysys-logo.png");
const maxirent = fs.readFileSync("assets/maxirent-logo.png");
function img(data, w, h, align = AlignmentType.CENTER) {
  return new Paragraph({ alignment: align, spacing: { after: 0 }, children: [
    new ImageRun({ type: "png", data, transformation: { width: w, height: h }, altText: { title: "Logo", description: "Logo", name: "Logo" } }) ] });
}

// ============================================================
//  MODELO DE ROI (cálculo en JS para consistencia total)
// ============================================================
const A = {
  leadsMes: 120,            // leads calificables / mes
  cierreActual: 0.08,       // tasa de cierre actual
  ticket: 180000,           // valor promedio del contrato (MXN)
  margen: 0.40,             // margen de contribución
  vendedores: 4
};
const contratosActualMes = A.leadsMes * A.cierreActual;       // 9.6
const contribContrato = A.ticket * A.margen;                  // 72,000

function escenario(liftPts, upsellPct) {
  const nuevaTasa = A.cierreActual + liftPts / 100;
  const contratosMes = A.leadsMes * nuevaTasa;
  const incMes = contratosMes - contratosActualMes;
  const incAnio = incMes * 12;
  const ingNuevos = incMes * A.ticket * 12;
  const ingUpsell = (contratosMes * A.ticket) * upsellPct * 12;
  const ingTotal = ingNuevos + ingUpsell;
  const utilidad = ingTotal * A.margen;
  return { liftPts, upsellPct, nuevaTasa, contratosMes, incAnio, ingNuevos, ingUpsell, ingTotal, utilidad };
}
const cons = escenario(1.5, 0.03);
const base = escenario(3.0, 0.06);
const opt  = escenario(4.0, 0.08);

// Costo año 1
const inversionPlataforma = 216000;        // llave en mano
const suscMesMin = 3000, suscMesMax = 6000;
const suscAnio = 4500 * 12;                 // estimado medio = 54,000
const costoAnio1 = inversionPlataforma + suscAnio;   // 270,000

const roi = (e) => (e.utilidad - costoAnio1) / costoAnio1;
const payback = (e) => costoAnio1 / (e.utilidad / 12); // meses
const breakEvenContratos = costoAnio1 / contribContrato; // contratos/año para cubrir costo

// ============================================================
//  DOCUMENTO
// ============================================================
const doc = new Document({
  creator: "Analy-sys", title: "Propuesta de Inteligencia Comercial con IA — MAXIRent",
  styles: {
    default: { document: { run: { font: "Arial", size: 22, color: "1F2937" } } },
    paragraphStyles: [
      { id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 30, bold: true, font: "Arial", color: NAVY },
        paragraph: { spacing: { before: 320, after: 160 }, outlineLevel: 0,
          border: { bottom: { style: BorderStyle.SINGLE, size: 8, color: BLUE, space: 6 } } } },
      { id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 25, bold: true, font: "Arial", color: BLUE },
        paragraph: { spacing: { before: 240, after: 120 }, outlineLevel: 1 } },
      { id: "Heading3", name: "Heading 3", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 23, bold: true, font: "Arial", color: NAVY },
        paragraph: { spacing: { before: 160, after: 80 }, outlineLevel: 2 } },
    ]
  },
  numbering: { config: [
    { reference: "bul", levels: [{ level: 0, format: LevelFormat.BULLET, text: "•", alignment: AlignmentType.LEFT, style: { run: { color: BLUE }, paragraph: { indent: { left: 460, hanging: 260 } } } }] },
    { reference: "num", levels: [{ level: 0, format: LevelFormat.DECIMAL, text: "%1.", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 460, hanging: 260 } } } }] },
  ] },
  footnotes: {
    1: { children: [new Paragraph({ children: [t("Cifras ilustrativas en MXN, configurables con los datos reales de MAXIRent. No incluyen IVA.", { size: 18, color: MUTED })] })] }
  },
  sections: [{
    properties: { page: { size: { width: 12240, height: 15840 }, margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 } } },
    footers: { default: new Footer({ children: [ new Paragraph({
      tabStops: [{ type: TabStopType.RIGHT, position: TabStopPosition.MAX }],
      border: { top: { style: BorderStyle.SINGLE, size: 4, color: "D5DCE6", space: 6 } },
      children: [ t("Analy-sys  ·  Propuesta confidencial para MAXIRent", { size: 16, color: MUTED }),
        t("\tPágina ", { size: 16, color: MUTED }),
        new TextRun({ children: [PageNumber.CURRENT], size: 16, color: MUTED, font: "Arial" }) ] }) ] }) },
    children: [
      // ---------------- PORTADA ----------------
      spacer(420),
      img(analysys, 300, 83),
      spacer(900),
      new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 60 }, children: [t("PROPUESTA DE SERVICIO", { color: BLUE, bold: true, size: 24, allCaps: true })] }),
      new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 100 }, children: [t("Plataforma de Inteligencia Comercial con IA", { bold: true, size: 52, color: NAVY })] }),
      new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 60 }, children: [t("Captación inteligente de leads + Call Intelligence, integrada a Monday.com", { size: 26, color: GRAY })] }),
      spacer(700),
      new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 140 }, children: [t("Preparada exclusivamente para:", { size: 22, color: MUTED })] }),
      img(maxirent, 240, 84),
      spacer(700),
      new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 40 }, children: [t("Presenta:  Analy-sys — Inteligencia Comercial · IA", { size: 22, color: GRAY })] }),
      new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 40 }, children: [t("Junio 2026   ·   Monterrey, N.L.", { size: 22, color: GRAY })] }),
      new Paragraph({ alignment: AlignmentType.CENTER, children: [t("Documento confidencial", { size: 18, color: MUTED, italics: true })] }),

      // ---------------- ÍNDICE ----------------
      new Paragraph({ pageBreakBefore: true, heading: HeadingLevel.HEADING_1, children: [t("Contenido")] }),
      new TableOfContents("Contenido", { hyperlink: true, headingStyleRange: "1-2" }),

      // ---------------- 1. RESUMEN EJECUTIVO ----------------
      new Paragraph({ pageBreakBefore: true, heading: HeadingLevel.HEADING_1, children: [t("1. Resumen ejecutivo")] }),
      body("MAXIRent compite en un mercado donde la velocidad de respuesta, la disciplina de seguimiento y la calidad de cada conversación de venta determinan quién cierra el contrato de flotilla. Hoy, gran parte de ese valor se pierde en el camino: leads que se enfrían, llamadas que nadie analiza y oportunidades de renovación o ampliación de flota que pasan desapercibidas."),
      body("Analy-sys propone una plataforma de inteligencia comercial impulsada por IA, integrada de forma nativa a Monday.com, que genera nuevos prospectos B2B desde fuentes oficiales, automatiza la calificación de cada lead, analiza cada llamada de ventas con metodologías profesionales (Sandler y Challenger), nunca olvida un seguimiento, detecta oportunidades de upsell y proyecta el pipeline — todo dentro del tablero que su equipo ya usa."),
      body("La propuesta económica está diseñada para ser de bajo riesgo: la inversión se liquida en planes de 6 o 12 meses y, como verá en la sección de ROI, el sistema se paga a sí mismo con apenas unos cuantos contratos adicionales al año. El resto es utilidad incremental directa para MAXIRent."),
      spacer(60),
      table([2340, 2340, 2340, 2340], [
        new TableRow({ children: [
          cell([t("Punto de equilibrio", { bold: true, color: NAVY, size: 28, align: AlignmentType.CENTER })], { w: 2340, fill: FILL_SUB, align: AlignmentType.CENTER }),
          cell([t("ROI estimado (Año 1)", { bold: true, color: NAVY, size: 28 })], { w: 2340, fill: FILL_SUB, align: AlignmentType.CENTER }),
          cell([t("Recuperación", { bold: true, color: NAVY, size: 28 })], { w: 2340, fill: FILL_SUB, align: AlignmentType.CENTER }),
          cell([t("Implementación", { bold: true, color: NAVY, size: 28 })], { w: 2340, fill: FILL_SUB, align: AlignmentType.CENTER }),
        ] }),
        new TableRow({ children: [
          cell([t(Math.ceil(breakEvenContratos) + " contratos/año", { bold: true, color: GREEN, size: 26 })], { w: 2340, align: AlignmentType.CENTER }),
          cell([t("+" + Math.round(roi(base) * 100) + "%", { bold: true, color: GREEN, size: 26 })], { w: 2340, align: AlignmentType.CENTER }),
          cell([t("≈ " + payback(base).toFixed(1) + " meses", { bold: true, color: BLUE, size: 26 })], { w: 2340, align: AlignmentType.CENTER }),
          cell([t("2 a 4 semanas", { bold: true, color: BLUE, size: 26 })], { w: 2340, align: AlignmentType.CENTER }),
        ] }),
      ]),
      spacer(60),
      body("En síntesis, esta no es una compra de software: es una palanca de crecimiento comercial con retorno medible desde el primer mes."),

      // ---------------- 2. EL RETO ----------------
      h1("2. El reto comercial de MAXIRent"),
      body("A partir de la operación típica de una rentadora de flotillas, identificamos cinco fugas de valor que la plataforma resuelve directamente:"),
      h3("2.1 Respuesta lenta a prospectos"),
      body("Un lead que recibe respuesta en los primeros minutos tiene una probabilidad de calificación varias veces mayor que uno contactado horas después. Sin priorización automática, los vendedores atienden por orden de llegada y no por valor potencial."),
      h3("2.2 Llamadas de venta sin análisis"),
      body("Cada llamada contiene señales de compra, objeciones y compromisos que hoy se pierden. No existe forma sistemática de saber qué hizo bien el vendedor, qué falló y qué seguimiento quedó pendiente."),
      h3("2.3 Seguimientos que se caen"),
      body("Compromisos pactados en una llamada (“le envío la cotización el viernes”) que nunca se cumplen; leads calientes que se enfrían por falta de un siguiente toque. Cada uno es un contrato que se va con la competencia."),
      h3("2.4 Oportunidades de upsell invisibles"),
      body("Clientes que mencionan expansión de flota, renovación próxima o necesidad de un vehículo distinto al cotizado — ingresos adicionales que el equipo no capitaliza por falta de detección."),
      h3("2.5 Coaching y pronóstico sin datos"),
      body("La dirección comercial carece de una visión objetiva del desempeño del equipo y de un pronóstico de ingresos confiable para planear flota e inversión."),

      // ---------------- 3. LA SOLUCIÓN ----------------
      h1("3. La solución: una plataforma, dentro de Monday"),
      body("Analy-sys entrega una plataforma de agentes de IA que trabajan de forma coordinada sobre cada lead y cada llamada, y escriben los resultados directamente en Monday.com. El equipo no cambia de herramienta: ve la inteligencia donde ya trabaja."),
      h3("Vistas integradas en Monday.com"),
      bullet([t("Vista de Tablero (Board View): ", { bold: true }), t("lista priorizada de leads con score, prioridad y riesgo, más KPIs del pipeline.")]),
      bullet([t("Vista de Elemento (Item View): ", { bold: true }), t("el análisis completo de cada lead y el historial de sus llamadas, por teléfono.")]),
      bullet([t("Dashboard ejecutivo embebido: ", { bold: true }), t("la plataforma completa como widget dentro de un dashboard de Monday, para dirección.")]),
      h3("Escritura segura, sin tocar sus automatizaciones"),
      body("El sistema escribe únicamente en columnas nuevas y dedicadas de IA que se crean para este fin (Score IA, Prioridad IA, Requiere atención, etc.). No modifica columnas existentes ni sus automatizaciones actuales: la integración es aditiva y reversible, por diseño."),

      // ---------------- 4. CAPACIDADES ----------------
      h1("4. Capacidades a detalle"),
      h2("4.1 Captación y calificación de leads con IA"),
      body("Cada prospecto (de landing, formulario o creado en Monday) se enriquece y califica automáticamente: score de viabilidad 0–100 con desglose transparente, prioridad (caliente/tibia/fría), nivel de riesgo, investigación de la empresa (sector, tamaño, presencia digital, contratos de gobierno, si ya renta con la competencia), detección de duplicados, y un plan de acción con preguntas de descubrimiento listas para la primera llamada."),

      h2("4.2 Prospección inteligente de leads (outbound)"),
      body("Además de captar leads entrantes, la plataforma genera prospectos B2B de forma proactiva. Su equipo busca empresas por sector y ciudad —por ejemplo, constructoras, transportistas o empresas de logística en Monterrey— desde fuentes oficiales y con pleno cumplimiento legal, y las incorpora al pipeline con un clic, ya enriquecidas y calificadas por la IA. Deja de depender únicamente de que el lead llegue: ahora también lo sale a buscar, con criterio."),
      bullet([t("Fuentes legales y conectables: ", { bold: true }), t("Google Places (directorio oficial de empresas), Lusha (proveedor B2B con cumplimiento, con datos de contactos y decisores tipo LinkedIn), licitaciones públicas de gobierno e importación de listas propias. La arquitectura permite sumar nuevas fuentes sin rehacer nada.")]),
      bullet([t("Cumplimiento por diseño: ", { bold: true }), t("no se hace scraping de LinkedIn ni de sitios que lo prohíben — eso viola sus Términos de Servicio y la Ley Federal de Protección de Datos. Se usan APIs oficiales y proveedores que ya resolvieron la base legal del dato, protegiendo a MAXIRent de cualquier riesgo.")]),
      bullet([t("Anti-duplicados: ", { bold: true }), t("detecta y omite automáticamente las empresas que ya están en su tablero, de modo que cada búsqueda traiga prospectos nuevos y no repita trabajo.")]),
      bullet([t("Alta directa a Monday: ", { bold: true }), t("los prospectos seleccionados se crean en un grupo dedicado del tablero (“Prospección”) y se analizan al instante con score, prioridad y perfil de empresa — listos para que el vendedor los trabaje.")]),
      bullet([t("Costo bajo control: ", { bold: true }), t("la búsqueda base no consume créditos; los datos de contacto directo (email y teléfono) se revelan únicamente cuando usted lo decide, prospecto por prospecto.")]),

      h2("4.3 Call Intelligence — análisis profesional de cada llamada"),
      body("La grabación de Aircall se transcribe automáticamente (Aircall AI o Deepgram) y se analiza en cinco pasadas complementarias:"),
      numItem([t("Sandler: ", { bold: true }), t("evaluación por las 7 etapas del método (vínculo, dolor, presupuesto, decisión, cierre…) con evidencia textual.")]),
      numItem([t("Challenger Sale: ", { bold: true }), t("6 dimensiones, perfil del vendedor e insight comercial sugerido.")]),
      numItem([t("Análisis integrado: ", { bold: true }), t("fusiona ambos modelos en un score global, resumen ejecutivo y plan de acción.")]),
      numItem([t("Coaching + análisis profundo: ", { bold: true }), t("qué hizo bien el vendedor, qué falló y su impacto, habilidades, banderas rojas y citas clave.")]),
      numItem([t("Oportunidades: ", { bold: true }), t("detección de upsell y cross-sell (expansión de flota, renovación próxima, servicios adicionales).")]),
      h2("4.4 Next Best Action — el supervisor que nunca olvida"),
      body("Vigila la operación y levanta alertas accionables: compromisos vencidos o sin seguimiento, leads calientes que se enfrían y llamadas con banderas rojas. Escribe las de alta prioridad en Monday para que las notificaciones nativas avisen al vendedor."),
      h2("4.5 Coaching del equipo"),
      body("Agrega el desempeño del equipo: promedios Sandler/Challenger, la etapa más débil a entrenar, distribución de perfiles, radar de habilidades, banderas rojas y objeciones recurrentes, y tendencia mensual. Convierte el análisis de llamadas en mejora medible del equipo."),
      h2("4.6 Pipeline & Forecast"),
      body("Pondera cada oportunidad por su probabilidad de cierre y proyecta el ingreso esperado por mes, con funnel por etapa. Da a dirección un pronóstico para planear flota e inversión, con supuestos transparentes."),
      h2("4.7 Asistente comercial (Chat con su histórico)"),
      body("Un chat que responde preguntas en lenguaje natural sobre todo el histórico (“¿qué leads de construcción objetaron precio este mes?”), convirtiendo meses de datos en respuestas inmediatas."),

      // ---------------- 5. ROI ----------------
      new Paragraph({ pageBreakBefore: true, heading: HeadingLevel.HEADING_1, children: [t("5. Retorno de inversión (ROI)")] }),
      body("Esta sección cuantifica el retorno con supuestos conservadores y transparentes. Todas las cifras son parámetros que ajustaremos con los datos reales de MAXIRent; aquí usamos valores ilustrativos y deliberadamente prudentes para no sobrevender."),

      h2("5.1 Supuestos base"),
      table([5160, 4200], [
        headerRow(["Variable", "Valor"], [5160, 4200]),
        row(["Leads calificables por mes", fmt0(A.leadsMes)], [5160, 4200]),
        row(["Tasa de cierre actual", (A.cierreActual * 100).toFixed(0) + "%"], [5160, 4200], { fill: FILL_LITE }),
        row(["Contratos cerrados hoy (mensual)", contratosActualMes.toFixed(1)], [5160, 4200]),
        row([[t("Valor promedio por contrato", {})], fmt(A.ticket)], [5160, 4200], { fill: FILL_LITE }),
        row(["Margen de contribución", (A.margen * 100).toFixed(0) + "%"], [5160, 4200]),
        row(["Utilidad de contribución por contrato", fmt(contribContrato)], [5160, 4200], { fill: FILL_LITE }),
        row(["Vendedores", String(A.vendedores)], [5160, 4200]),
      ]),
      new Paragraph({ spacing: { after: 160 }, children: [t("Cifras ilustrativas; se sustituyen por los datos reales de MAXIRent.", { size: 18, color: MUTED, italics: true })] }),

      h2("5.2 De dónde viene el valor"),
      body("La plataforma incrementa los ingresos por cuatro vías, sin canibalizarse entre sí:"),
      bullet([t("Más leads (outbound): ", { bold: true }), t("la prospección inteligente suma prospectos nuevos al embudo —empresas que hoy no llegarían solas— ampliando la base sobre la que opera todo lo demás.")]),
      bullet([t("Más conversión: ", { bold: true }), t("respuesta inmediata a leads calientes, priorización por score y coaching de llamadas elevan la tasa de cierre.")]),
      bullet([t("Menos fugas: ", { bold: true }), t("el seguimiento automático recupera compromisos y leads que hoy se pierden.")]),
      bullet([t("Más ticket: ", { bold: true }), t("la detección de upsell/cross-sell amplía contratos existentes (expansión y renovación de flota).")]),

      h2("5.3 Escenarios de retorno (anuales)"),
      table([2700, 2220, 2220, 2220], [
        headerRow(["Concepto", "Conservador", "Base", "Optimista"], [2700, 2220, 2220, 2220]),
        row(["Aumento de conversión", "+1.5 pts", "+3.0 pts", "+4.0 pts"], [2700, 2220, 2220, 2220]),
        row(["Upsell sobre cartera", "+3%", "+6%", "+8%"], [2700, 2220, 2220, 2220], { fill: FILL_LITE }),
        row(["Contratos incrementales / año", fmt0(cons.incAnio), fmt0(base.incAnio), fmt0(opt.incAnio)], [2700, 2220, 2220, 2220]),
        row(["Ingreso incremental / año", fmt(cons.ingTotal), fmt(base.ingTotal), fmt(opt.ingTotal)], [2700, 2220, 2220, 2220], { fill: FILL_LITE }),
        row([{ __cell: true, v: "Utilidad de contribución / año", bold: true },
             { __cell: true, v: fmt(cons.utilidad), bold: true, color: GREEN, align: AlignmentType.CENTER },
             { __cell: true, v: fmt(base.utilidad), bold: true, color: GREEN, align: AlignmentType.CENTER },
             { __cell: true, v: fmt(opt.utilidad), bold: true, color: GREEN, align: AlignmentType.CENTER }], [2700, 2220, 2220, 2220]),
        row(["Costo total Año 1 (inversión + suscripciones)", fmt(costoAnio1), fmt(costoAnio1), fmt(costoAnio1)], [2700, 2220, 2220, 2220], { fill: FILL_LITE }),
        row([{ __cell: true, v: "ROI Año 1", bold: true },
             { __cell: true, v: "+" + Math.round(roi(cons) * 100) + "%", bold: true, color: BLUE, align: AlignmentType.CENTER },
             { __cell: true, v: "+" + Math.round(roi(base) * 100) + "%", bold: true, color: BLUE, align: AlignmentType.CENTER },
             { __cell: true, v: "+" + Math.round(roi(opt) * 100) + "%", bold: true, color: BLUE, align: AlignmentType.CENTER }], [2700, 2220, 2220, 2220]),
        row(["Recuperación de la inversión", "≈ " + payback(cons).toFixed(1) + " meses", "≈ " + payback(base).toFixed(1) + " meses", "≈ " + payback(opt).toFixed(1) + " meses"], [2700, 2220, 2220, 2220], { fill: FILL_LITE }),
      ]),
      new Paragraph({ spacing: { after: 160 }, children: [t("Utilidad de contribución = ingreso incremental × margen. ROI = (utilidad − costo) / costo.", { size: 18, color: MUTED, italics: true })] }),

      h2("5.4 El argumento más conservador: punto de equilibrio"),
      callout("El sistema se paga con apenas " + Math.ceil(breakEvenContratos) + " contratos adicionales al año.", [
        [t("Costo total del Año 1: ", { color: GRAY }), t(fmt(costoAnio1), { bold: true, color: NAVY }), t("  ÷  utilidad por contrato: ", { color: GRAY }), t(fmt(contribContrato), { bold: true, color: NAVY })],
        [t("= " + breakEvenContratos.toFixed(1) + " contratos al año para alcanzar el equilibrio — es decir, ", { color: GRAY }), t("1 contrato adicional cada ~3 meses.", { bold: true, color: GREEN })],
        [t("Todo lo que el sistema genere por encima de eso es utilidad incremental directa para MAXIRent.", { color: GRAY })]
      ]),
      spacer(80),
      body("Dicho de otro modo: aun en un escenario pesimista en el que la plataforma sólo aportara un puñado de contratos al año, la inversión se recupera. Los escenarios de la tabla anterior — perfectamente alcanzables para un equipo de ventas activo — multiplican ese retorno."),

      h2("5.5 Beneficios adicionales (no incluidos en el ROI anterior)"),
      body("Para no inflar las cifras, el modelo anterior NO contabiliza estos beneficios, que se suman al retorno:"),
      bullet([t("Productividad recuperada: ", { bold: true }), t("la investigación de empresas, los resúmenes de llamada y la priorización dejan de ser trabajo manual. Estimado: 4–6 horas por vendedor por semana, reinvertidas en vender.")]),
      bullet([t("Onboarding de vendedores más rápido: ", { bold: true }), t("el coaching automático acorta la curva de aprendizaje de cada nuevo vendedor.")]),
      bullet([t("Mejor experiencia del cliente: ", { bold: true }), t("respuestas más rápidas y mejor preparadas elevan la tasa de conversión y la reputación de MAXIRent.")]),
      bullet([t("Decisiones con datos: ", { bold: true }), t("el pronóstico de pipeline permite planear flota e inversión con anticipación.")]),

      // ---------------- 6. INVERSIÓN Y PAGOS ----------------
      new Paragraph({ pageBreakBefore: true, heading: HeadingLevel.HEADING_1, children: [t("6. Inversión y planes de pago")] }),
      body("La inversión es por la plataforma llave en mano: implementación completa, integración con Monday y Aircall, configuración de los agentes de IA, puesta en marcha y capacitación del equipo, más soporte durante el primer año."),
      h2("6.1 Inversión de la plataforma"),
      table([4680, 4680], [
        headerRow(["Concepto", "Inversión (MXN + IVA)"], [4680, 4680]),
        row([[t("Plataforma llave en mano (Año 1)", { bold: true })], [t(fmt(inversionPlataforma), { bold: true, color: NAVY })]], [4680, 4680]),
        row(["Incluye: implementación, integración Monday + Aircall, configuración de agentes IA, capacitación y soporte Año 1", ""], [4680, 4680], { fill: FILL_LITE }),
      ]),
      h2("6.2 Planes de pago a 6 o 12 meses"),
      body("Para facilitar la decisión, la inversión se difiere sin descapitalizar a MAXIRent. Elija el plan que mejor se ajuste a su flujo:"),
      table([3120, 3120, 3120], [
        headerRow(["Plan", "Pago mensual", "Total"], [3120, 3120, 3120]),
        row([[t("6 meses — sin recargo", { bold: true })], [t(fmt(inversionPlataforma / 6), { bold: true, color: GREEN })], fmt(inversionPlataforma)], [3120, 3120, 3120]),
        row([[t("12 meses — con soporte extendido", { bold: true })], [t(fmt(240000 / 12), { bold: true, color: BLUE })], fmt(240000)], [3120, 3120, 3120], { fill: FILL_LITE }),
      ]),
      new Paragraph({ spacing: { after: 120 }, children: [t("El plan a 12 meses incluye un recargo de financiamiento e incorpora soporte y mantenimiento extendido. Ambos planes inician con la firma del acuerdo; la operación arranca en 2–4 semanas.", { size: 18, color: MUTED, italics: true })] }),
      callout("Comparado con el retorno, la mensualidad es marginal.", [
        [t("La mensualidad a 12 meses (" + fmt(240000 / 12) + ") representa una fracción de la utilidad de un solo contrato de flotilla (" + fmt(contribContrato) + ").", { color: GRAY })]
      ], { fill: "EAF2FB", bar: BLUE }),

      // ---------------- 7. SUSCRIPCIONES ----------------
      h1("7. Suscripciones operativas requeridas"),
      body("La plataforma se apoya en servicios de terceros de nivel empresarial. Estas suscripciones son recurrentes y las contrata MAXIRent a su nombre — así los datos, las cuentas y el control permanecen siempre de su lado. Las dimensionamos al volumen real para que sólo pague por lo que usa. Son independientes de la inversión de la plataforma."),
      table([2700, 4060, 2600], [
        headerRow(["Servicio", "Para qué sirve", "Costo estimado / mes"], [2700, 4060, 2600]),
        row(["Monday.com", "CRM y vistas embebidas (su equipo probablemente ya lo usa).", "Según plan/asientos actuales"], [2700, 4060, 2600]),
        row(["Nube + base de datos", "Hospedaje del sistema y base de datos durable con respaldos.", "$900 – $1,500"], [2700, 4060, 2600], { fill: FILL_LITE }),
        row(["Motor de IA (Claude / Gemini)", "El “cerebro” que analiza leads y llamadas. Pago por uso; optimizable por modelo.", "$500 – $2,500"], [2700, 4060, 2600]),
        row(["Aircall", "Telefonía y grabación de llamadas (probablemente ya contratado).", "Según plan actual"], [2700, 4060, 2600], { fill: FILL_LITE }),
        row(["Deepgram (opcional)", "Transcripción de llamadas si no se usa Aircall AI. Pago por minuto.", "$300 – $1,000"], [2700, 4060, 2600]),
        row(["Lusha (prospección B2B)", "Datos de empresas y decisores tipo LinkedIn, con cumplimiento legal. Empieza con plan gratuito; planes de pago por volumen de contactos revelados.", "Desde $0 (plan gratuito)"], [2700, 4060, 2600], { fill: FILL_LITE }),
        row(["Google Places (prospección)", "Directorio oficial de empresas por sector y zona. Incluye $200 USD/mes de uso sin costo de Google.", "$0 – $600"], [2700, 4060, 2600]),
        row([{ __cell: true, v: "Total estimado adicional", bold: true },
             { __cell: true, v: "Excluyendo Monday/Aircall que ya tengan", color: GRAY },
             { __cell: true, v: fmt(suscMesMin).replace(" MXN", "") + " – " + fmt(suscMesMax), bold: true, color: NAVY, align: AlignmentType.CENTER }], [2700, 4060, 2600]),
      ]),
      spacer(60),
      body("Transparencia total: Analy-sys no revende estas suscripciones ni cobra comisión sobre ellas. Le ayudamos a configurarlas, optimizar su costo y mantenerlas dentro de su presupuesto. En modo demostración, la plataforma funciona incluso sin costo de IA."),

      // ---------------- 8. IMPLEMENTACIÓN ----------------
      h1("8. Implementación"),
      body("Puesta en marcha ágil, sin frenar la operación. Estimado de 2 a 4 semanas según disponibilidad:"),
      table([2200, 4360, 2800], [
        headerRow(["Etapa", "Actividades", "Tiempo"], [2200, 4360, 2800]),
        row(["1. Despliegue", "Infraestructura en la nube, base de datos y puesta en línea segura (HTTPS).", "Semana 1"], [2200, 4360, 2800]),
        row(["2. Integración Monday", "Columnas de IA, vistas embebidas (tablero, item, dashboard) y webhook de leads.", "Semana 1–2"], [2200, 4360, 2800], { fill: FILL_LITE }),
        row(["3. Aircall + IA", "Conexión de telefonía, transcripción y configuración de los agentes de análisis.", "Semana 2–3"], [2200, 4360, 2800]),
        row(["4. Capacitación", "Entrenamiento del equipo de ventas y de dirección; ajustes finos.", "Semana 3–4"], [2200, 4360, 2800], { fill: FILL_LITE }),
        row(["5. Operación", "Acompañamiento y soporte durante el primer año.", "Continuo"], [2200, 4360, 2800]),
      ]),

      // ---------------- 9. POR QUÉ ANALY-SYS ----------------
      h1("9. Por qué Analy-sys"),
      bullet([t("Solución a la medida de MAXIRent: ", { bold: true }), t("construida para la renta de flotillas y su proceso comercial, no un software genérico.")]),
      bullet([t("Sus datos, su control: ", { bold: true }), t("las cuentas y la información son de MAXIRent; nada queda cautivo.")]),
      bullet([t("Integración no invasiva: ", { bold: true }), t("trabaja dentro de Monday sin romper sus automatizaciones actuales.")]),
      bullet([t("Prospección con cumplimiento: ", { bold: true }), t("genera leads nuevos desde fuentes oficiales y proveedores con base legal, sin exponer a MAXIRent a los riesgos del scraping ilegal.")]),
      bullet([t("IA de última generación: ", { bold: true }), t("modelos líderes (Claude / Gemini), con costo optimizado y modo demostración sin gasto de IA.")]),
      bullet([t("Acompañamiento real: ", { bold: true }), t("implementación, capacitación y soporte durante el primer año incluidos.")]),

      // ---------------- 10. SIGUIENTES PASOS ----------------
      h1("10. Siguientes pasos"),
      numItem([t("Sesión de validación: ", { bold: true }), t("revisamos juntos los supuestos del ROI con los datos reales de MAXIRent.")]),
      numItem([t("Elección del plan de pago: ", { bold: true }), t("6 o 12 meses, según su flujo.")]),
      numItem([t("Firma y arranque: ", { bold: true }), t("inicia la implementación; en 2–4 semanas el equipo opera con la plataforma.")]),
      spacer(160),
      callout("Convirtamos cada llamada y cada lead en un contrato.", [
        [t("Analy-sys — Inteligencia Comercial · IA", { bold: true, color: NAVY })],
        [t("Jorge Carrazco   ·   ", { color: GRAY }), t("jcarrazco95@gmail.com", { color: BLUE })],
      ], { fill: "EAF2FB", bar: NAVY }),
    ]
  }]
});

Packer.toBuffer(doc).then((buf) => {
  // Permite un nombre de salida alterno (p. ej. si el archivo está abierto en Word).
  const out = process.env.OUT || process.argv[2] || "Propuesta-Analy-sys-MAXIRent.docx";
  fs.writeFileSync(out, buf);
  console.log("OK -> " + out + " (" + buf.length + " bytes)");
});
