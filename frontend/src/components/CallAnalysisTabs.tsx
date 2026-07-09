import { useState } from "react";
import { Phone, Sparkles, BarChart3, Layers, Target, User, FileText, AlertTriangle, ThumbsUp, Quote, TrendingUp } from "lucide-react";
import type { CallAnalysisData, Banda, UpsellAnalysis, UpsellTipo } from "../types";

// ===========================================================================
//  Vistas compartidas de analisis de llamada (Sandler + Challenger + coaching).
//  Las usan la pagina Call Intelligence y el Item View de Monday.
//  5 sub-pestanas: Llamada / Vendedor / Sandler / Challenger / Analiticas.
// ===========================================================================

const BAND_TEXT: Record<Banda, string> = { rojo: "text-danger", amarillo: "text-warning", verde: "text-success" };
const BAND_BAR: Record<Banda, string> = { rojo: "bg-danger", amarillo: "bg-warning", verde: "bg-success" };
const SENT_COL: Record<string, string> = { positivo: "text-success", neutro: "text-text-muted", negativo: "text-danger" };
const SENT_ICON: Record<string, string> = { positivo: "🙂", neutro: "😐", negativo: "🙁" };
const PRIO_CHIP: Record<string, string> = {
  alta: "bg-danger/15 text-danger border border-danger/25",
  media: "bg-warning/15 text-warning border border-warning/25",
  baja: "bg-border text-text-muted border border-border"
};
const ESTADO_CHIP: Record<string, string> = {
  cumplida: "bg-success/15 text-success",
  parcial: "bg-warning/15 text-warning",
  deficiente: "bg-danger/15 text-danger",
  no_aplica: "bg-border text-text-muted"
};
const ESTADO_LABEL: Record<string, string> = { cumplida: "Cumplida", parcial: "Parcial", deficiente: "Deficiente", no_aplica: "N/A" };
const MOMENTO_DOT: Record<string, string> = { positivo: "bg-success", negativo: "bg-danger", neutro: "bg-text-muted" };

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
function bar(p: number, m = 100) { const r = m > 0 ? p / m : 0; return r >= 0.7 ? "bg-success" : r >= 0.4 ? "bg-warning" : "bg-danger"; }
function bandaOf(p: number): Banda { return p >= 75 ? "verde" : p >= 50 ? "amarillo" : "rojo"; }
function sandlerScoreBasic(c: CallAnalysisData): number {
  return c.probabilidadCierre === "alta" ? 85 : c.probabilidadCierre === "media" ? 60 : c.probabilidadCierre === "baja" ? 35 : 50;
}

function Section({ icon, title, right, children }: { icon: React.ReactNode; title: string; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-border bg-surface p-5">
      <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
        <span className="text-accent">{icon}</span> {title}
        {right && <span className="ml-auto">{right}</span>}
      </div>
      {children}
    </div>
  );
}

function TwoColList({ icon, title, items, color }: { icon: string; title: string; items: string[]; color: string }) {
  if (!items.length) return null;
  return (
    <div className="rounded-lg border border-border p-3">
      <p className={`mb-1.5 text-[12px] font-semibold ${color}`}>{icon} {title}</p>
      <ul className="flex flex-col gap-1 text-[13px] text-text">
        {items.map((it, i) => (<li key={i} className="flex gap-1.5"><span className="text-text-muted">•</span>{it}</li>))}
      </ul>
    </div>
  );
}

// ─── Oportunidades comerciales (upsell / cross-sell) ──
const UPSELL_POT_CHIP: Record<string, string> = {
  alto: "bg-success/15 text-success border border-success/25",
  medio: "bg-warning/15 text-warning border border-warning/25",
  bajo: "bg-border text-text-muted border border-border"
};
const UPSELL_LABEL: Record<UpsellTipo, string> = {
  expansion_flota: "Expansión de flota",
  renovacion_proxima: "Renovación próxima",
  vehiculo_adicional: "Vehículo adicional",
  upgrade_unidad: "Upgrade de unidad",
  servicio_adicional: "Servicio adicional"
};

function OportunidadesCard({ op }: { op: UpsellAnalysis }) {
  if (!op.hayOportunidad || op.senales.length === 0) return null;
  return (
    <Section
      icon={<TrendingUp size={15} />}
      title="Oportunidades de crecimiento (upsell / cross-sell)"
      right={op.ingresoIncrementalEstimado ? <span className="rounded-full bg-success/15 px-2.5 py-1 text-[11px] font-semibold text-success">{op.ingresoIncrementalEstimado}</span> : undefined}
    >
      <p className="mb-3 text-[13px] text-text-muted">{op.resumen}</p>
      <div className="flex flex-col gap-2">
        {op.senales.map((s, i) => (
          <div key={i} className="rounded-lg border border-success/25 bg-success/[0.05] p-3 text-[13px]">
            <div className="mb-1 flex items-center gap-2">
              <span className="rounded-full bg-accent/10 px-2 py-0.5 text-[11px] font-semibold text-accent">{UPSELL_LABEL[s.tipo] ?? s.tipo}</span>
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${UPSELL_POT_CHIP[s.potencial]}`}>{s.potencial}</span>
            </div>
            <p className="text-text">{s.descripcion}</p>
            {s.vehiculoSugerido && <p className="mt-0.5 text-[12px] text-text-muted">Ofrecer: <span className="font-medium text-text">{s.vehiculoSugerido}</span></p>}
            <p className="mt-1 text-[12px] text-accent">→ {s.accionSugerida}</p>
            {s.evidencia && <p className="mt-1 text-[11px] italic text-text-muted">"{s.evidencia}"</p>}
          </div>
        ))}
      </div>
    </Section>
  );
}

// ─── Transcripción de la llamada (lo primero de la pestaña Llamada) ──
function TranscripcionCard({ transcript }: { transcript?: string | null }) {
  if (!transcript?.trim()) return null;
  return (
    <Section
      icon={<FileText size={15} />}
      title="Transcripción de la llamada"
      right={<span className="rounded-full bg-accent/10 px-2.5 py-1 text-[11px] font-semibold text-accent">Deepgram</span>}
    >
      <div className="max-h-80 overflow-y-auto rounded-lg border border-border bg-black/[0.02] p-3">
        <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-text">{transcript.trim()}</p>
      </div>
    </Section>
  );
}

// ─── LLAMADA (analisis profundo) ──
function LlamadaView({ call }: { call: CallAnalysisData }) {
  const dp = call.analisisProfundo;
  const transcripcion = <TranscripcionCard transcript={call.transcript} />;
  const upsell = call.oportunidades ? <OportunidadesCard op={call.oportunidades} /> : null;
  if (!dp) {
    return (
      <div className="flex flex-col gap-4">
        {transcripcion}
        {upsell}
        <Section icon={<FileText size={15} />} title="Resumen de la llamada">
          <p className="text-[13px] leading-relaxed text-text-muted">{call.resumen ?? "Sin analisis profundo para esta llamada. Vuelve a analizarla para el desglose completo."}</p>
        </Section>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-4">
      {transcripcion}
      {upsell}
      <Section icon={<FileText size={15} />} title="Analisis profundo de la llamada">
        <p className="text-[13px] leading-relaxed text-text">{dp.resumenDetallado}</p>
      </Section>
      {dp.momentos.length > 0 && (
        <Section icon={<Layers size={15} />} title="Linea de tiempo de la llamada">
          <div className="flex flex-col gap-3">
            {dp.momentos.map((m, i) => (
              <div key={i} className="flex gap-3">
                <div className="flex flex-col items-center">
                  <span className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${MOMENTO_DOT[m.tipo]}`} />
                  {i < dp.momentos.length - 1 && <span className="my-0.5 w-px flex-1 bg-border" />}
                </div>
                <div className="pb-1">
                  <p className="text-[13px] font-medium text-text">{m.titulo}{m.marcaTiempo ? <span className="ml-2 text-[10px] text-text-muted">{m.marcaTiempo}</span> : null}</p>
                  <p className="text-[12px] leading-snug text-text-muted">{m.detalle}</p>
                </div>
              </div>
            ))}
          </div>
        </Section>
      )}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <TwoColList icon="🗂️" title="Temas tratados" items={dp.temasTratados} color="text-text" />
        <TwoColList icon="🎯" title="Necesidades del cliente" items={dp.necesidadesCliente} color="text-accent" />
        <TwoColList icon="🟢" title="Senales de compra" items={dp.senalesCompra} color="text-success" />
        <TwoColList icon="🚩" title="Banderas rojas" items={dp.banderasRojas} color="text-danger" />
      </div>
      {dp.citasDestacadas.length > 0 && (
        <Section icon={<Quote size={15} />} title="Citas destacadas">
          <div className="flex flex-col gap-2.5">
            {dp.citasDestacadas.map((q, i) => (
              <div key={i} className="rounded-lg border border-border p-3">
                <p className="border-l-2 border-accent pl-2 text-[13px] italic text-text">"{q.cita}"</p>
                <p className="mt-1 text-[11px] text-text-muted"><span className="font-semibold capitalize">{q.hablante}</span> · {q.porque}</p>
              </div>
            ))}
          </div>
        </Section>
      )}
    </div>
  );
}

// ─── VENDEDOR (coaching) ──
function VendedorView({ v }: { v: CallAnalysisData["vendedor"] }) {
  if (!v) return <p className="rounded-xl border border-border bg-surface p-6 text-center text-[13px] text-text-muted">Sin analisis del vendedor para esta llamada.</p>;
  return (
    <div className="flex flex-col gap-4">
      <Section icon={<User size={15} />} title="Desempeno del vendedor">
        <p className="text-[13px] leading-relaxed text-text">{v.desempenoGeneral}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <span className="rounded-full border border-border bg-black/[0.03] px-2.5 py-1 text-[11px] text-text-muted">Estilo: {v.estiloComunicacion}</span>
          {v.ratioHablaEscucha && <span className="rounded-full border border-border bg-black/[0.03] px-2.5 py-1 text-[11px] text-text-muted">Habla/Escucha: {v.ratioHablaEscucha}</span>}
        </div>
      </Section>
      {v.habilidades.length > 0 && (
        <Section icon={<BarChart3 size={15} />} title="Habilidades del vendedor">
          <div className="flex flex-col gap-2.5">
            {v.habilidades.map((h, i) => (
              <div key={i}>
                <div className="flex items-center justify-between text-[12px]"><span className="text-text">{h.nombre}</span><span className="font-semibold text-text-muted">{h.puntaje}/100</span></div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-black/10"><div className={`h-full rounded-full ${bar(h.puntaje)}`} style={{ width: `${h.puntaje}%` }} /></div>
                {h.comentario && <p className="mt-0.5 text-[11px] leading-snug text-text-muted">{h.comentario}</p>}
              </div>
            ))}
          </div>
        </Section>
      )}
      {v.puntosClave.length > 0 && (
        <Section icon={<ThumbsUp size={15} />} title="Puntos clave (lo que hizo bien)">
          <ul className="flex flex-col gap-1.5 text-[13px] text-text">
            {v.puntosClave.map((p, i) => (<li key={i} className="flex gap-2"><span className="text-success">✓</span>{p}</li>))}
          </ul>
        </Section>
      )}
      {v.fallos.length > 0 && (
        <Section icon={<AlertTriangle size={15} />} title="Que fallo (con impacto)">
          <div className="flex flex-col gap-2">
            {v.fallos.map((f, i) => (
              <div key={i} className="rounded-lg border border-danger/25 bg-danger/[0.05] p-3 text-[13px]">
                <p className="font-medium text-text"><span className="text-danger">✗</span> {f.descripcion}{f.momento ? <span className="ml-2 text-[11px] text-text-muted">({f.momento})</span> : null}</p>
                <p className="mt-0.5 text-[12px] text-text-muted"><span className="font-semibold">Impacto:</span> {f.impacto}</p>
              </div>
            ))}
          </div>
        </Section>
      )}
      {v.mejoras.length > 0 && (
        <Section icon={<Target size={15} />} title="Mejoras para el vendedor">
          <div className="flex flex-col gap-2">
            {v.mejoras.map((m, i) => (
              <div key={i} className="rounded-lg border border-border p-3 text-[13px]">
                <div className="mb-1 flex items-center gap-2">
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${PRIO_CHIP[m.prioridad]}`}>{m.prioridad}</span>
                  <span className="text-[12px] font-medium text-accent">{m.area}</span>
                </div>
                <p className="text-text">{m.accion}</p>
                {m.ejemploFrase && <p className="mt-1 text-[12px] italic text-text-muted">Ej: "{m.ejemploFrase}"</p>}
              </div>
            ))}
          </div>
        </Section>
      )}
    </div>
  );
}

// ─── SANDLER (por etapas) ──
function SandlerView({ call }: { call: CallAnalysisData }) {
  const sa = call.sandler;
  return (
    <div className="flex flex-col gap-4">
      <Section icon={<Phone size={15} />} title="Resumen de la llamada">
        <div className="mb-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {call.sentimiento && (
            <div className="rounded-lg border border-border p-3 text-center">
              <p className="text-[11px] text-text-muted">Sentimiento</p>
              <p className={`mt-1 text-lg font-bold ${SENT_COL[call.sentimiento]}`}>{SENT_ICON[call.sentimiento]} {cap(call.sentimiento)}</p>
            </div>
          )}
          {call.probabilidadCierre && (
            <div className="rounded-lg border border-border p-3 text-center">
              <p className="text-[11px] text-text-muted">Prob. de cierre</p>
              <p className="mt-1 text-lg font-bold text-text">{cap(call.probabilidadCierre)}</p>
            </div>
          )}
          {call.vehiculosMencionados.length > 0 && (
            <div className="rounded-lg border border-border p-3">
              <p className="text-[11px] text-text-muted">Vehiculos</p>
              <p className="mt-0.5 text-[12px] font-medium">{call.vehiculosMencionados.join(", ")}</p>
            </div>
          )}
        </div>
        {call.objeciones.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-2">
            {call.objeciones.map((o, i) => (<span key={i} className="rounded-lg bg-warning/10 px-2.5 py-1 text-[12px] text-warning">⚠ {o}</span>))}
          </div>
        )}
        {call.compromisos.length > 0 && (
          <div className="mb-2 flex flex-col gap-1.5">
            {call.compromisos.map((c, i) => (
              <div key={i} className="flex items-start gap-2 rounded-lg bg-success/[0.06] px-3 py-2 text-[13px]">
                <span className="mt-0.5 shrink-0 text-success">✔</span>
                <span className="text-text">{c.descripcion}</span>
                <span className="ml-auto shrink-0 text-[11px] text-text-muted">{c.responsable}{c.fecha ? ` · ${c.fecha}` : ""}</span>
              </div>
            ))}
          </div>
        )}
        {call.resumen && <p className="mt-1 text-[13px] leading-relaxed text-text-muted">{call.resumen}</p>}
      </Section>
      {sa ? (
        <Section icon={<Layers size={15} />} title="Desempeno por etapa — Sistema Sandler"
          right={<span className={`text-lg font-bold ${BAND_TEXT[sa.banda]}`}>{sa.puntajeFinal}<span className="text-[11px] text-text-muted">/100</span></span>}>
          {sa.momentoClave && (<p className="mb-3 rounded-lg border border-accent/25 bg-accent/[0.05] p-3 text-[13px]"><span className="font-semibold text-accent">🔑 Momento clave: </span>{sa.momentoClave}</p>)}
          <div className="flex flex-col gap-3">
            {sa.etapas.map((e) => (
              <div key={e.id} className="rounded-lg border border-border p-3">
                <div className="flex items-center gap-2">
                  <span className="text-[13px] font-medium text-text">{e.id}. {e.nombre}</span>
                  <span className="text-[10px] text-text-muted">· peso {e.peso}</span>
                  <span className={`ml-auto rounded-full px-2 py-0.5 text-[10px] font-semibold ${ESTADO_CHIP[e.estado]}`}>{ESTADO_LABEL[e.estado]}</span>
                  <span className="w-9 text-right text-[12px] font-semibold text-text-muted">{e.puntaje}</span>
                </div>
                <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-black/10"><div className={`h-full rounded-full ${bar(e.puntaje)}`} style={{ width: `${e.puntaje}%` }} /></div>
                {(e.aciertos.length > 0 || e.fallos.length > 0) && (
                  <div className="mt-2 grid gap-1.5 sm:grid-cols-2">
                    {e.aciertos.length > 0 && (<ul className="text-[12px] text-text">{e.aciertos.map((a, i) => (<li key={i} className="flex gap-1"><span className="text-success">✓</span>{a}</li>))}</ul>)}
                    {e.fallos.length > 0 && (<ul className="text-[12px] text-text">{e.fallos.map((f, i) => (<li key={i} className="flex gap-1"><span className="text-danger">✗</span>{f}</li>))}</ul>)}
                  </div>
                )}
                {e.evidencia.length > 0 && (
                  <div className="mt-2 flex flex-col gap-1">
                    {e.evidencia.map((ev, i) => (<p key={i} className="border-l-2 border-border pl-2 text-[11px] italic text-text-muted">"{ev.cita}"{ev.hablante ? ` — ${ev.hablante}` : ""}{ev.marcaTiempo ? ` (${ev.marcaTiempo})` : ""}</p>))}
                  </div>
                )}
              </div>
            ))}
          </div>
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <TwoColList icon="✅" title="Fortalezas" items={sa.fortalezas} color="text-success" />
            <TwoColList icon="⚠️" title="Areas de mejora" items={sa.areasMejora} color="text-warning" />
          </div>
          {sa.recomendaciones.length > 0 && (
            <div className="mt-3 flex flex-col gap-2">
              <p className="text-[12px] font-semibold text-text">🎯 Recomendaciones Sandler</p>
              {sa.recomendaciones.map((r, i) => (
                <div key={i} className="rounded-lg border border-border p-3 text-[13px]">
                  <div className="mb-1 flex items-center gap-2">
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${PRIO_CHIP[r.prioridad]}`}>{r.prioridad}</span>
                    {r.etapa && <span className="text-[11px] text-text-muted">{r.etapa}</span>}
                  </div>
                  <p className="text-text">{r.accion}</p>
                  {r.ejemploFrase && <p className="mt-1 text-[12px] italic text-text-muted">Ej: "{r.ejemploFrase}"</p>}
                </div>
              ))}
            </div>
          )}
        </Section>
      ) : (
        <p className="rounded-xl border border-border bg-surface p-6 text-center text-[13px] text-text-muted">Esta llamada se analizo con la version basica de Sandler. Vuelve a analizarla para el desglose por etapas.</p>
      )}
    </div>
  );
}

// ─── CHALLENGER ──
function ChallengerView({ ch }: { ch: CallAnalysisData["challenger"] }) {
  if (!ch) return <p className="rounded-xl border border-border bg-surface p-6 text-center text-[13px] text-text-muted">Sin analisis Challenger para esta llamada.</p>;
  return (
    <Section icon={<Sparkles size={15} />} title="Challenger Sale — reto comercial"
      right={<span className={`text-lg font-bold ${BAND_TEXT[ch.banda]}`}>{ch.score}<span className="text-[11px] text-text-muted">/100</span></span>}>
      <div className="mb-3"><span className="rounded-full border border-accent/30 bg-accent/10 px-2.5 py-0.5 text-[11px] font-semibold capitalize text-accent">Perfil: {ch.perfilVendedor.replace(/_/g, " ")}</span></div>
      <div className="mb-4 flex flex-col gap-2.5">
        {ch.dimensiones.map((d, i) => (
          <div key={i}>
            <div className="flex items-center justify-between text-[12px]"><span className="text-text">{d.criterio}</span><span className="font-semibold text-text-muted">{d.puntos}/{d.max}</span></div>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-black/10"><div className={`h-full rounded-full ${bar(d.puntos, d.max)}`} style={{ width: `${d.max > 0 ? Math.round((d.puntos / d.max) * 100) : 0}%` }} /></div>
            {d.justificacion && <p className="mt-0.5 text-[11px] leading-snug text-text-muted">{d.justificacion}</p>}
          </div>
        ))}
      </div>
      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <TwoColList icon="✅" title="Fortalezas" items={ch.fortalezas} color="text-success" />
        <TwoColList icon="⚠️" title="Areas de mejora" items={ch.areasMejora} color="text-warning" />
      </div>
      <div className="flex flex-col gap-2">
        <div className="rounded-lg border border-accent/30 bg-accent/[0.05] p-3 text-[13px]"><span className="font-semibold text-accent">💡 Insight para retar: </span>{ch.insightSugerido}</div>
        <div className="rounded-lg border border-border p-3 text-[13px]"><span className="font-semibold">🔄 Reframe: </span>{ch.reframeSugerido}</div>
        <div className="rounded-lg border border-success/40 bg-success/[0.06] p-3 text-[13px]"><span className="font-semibold text-success">➡ Siguiente paso: </span>{ch.siguientePaso}</div>
      </div>
    </Section>
  );
}

// ─── ANALITICAS (fusion) ──
function AnaliticasView({ call }: { call: CallAnalysisData }) {
  const sScore = call.sandler?.puntajeFinal ?? sandlerScoreBasic(call);
  const sBanda = call.sandler?.banda ?? bandaOf(sScore);
  const ch = call.challenger;
  const integ = call.integrado;
  const global = integ?.scoreGlobal ?? (ch ? Math.round(sScore * 0.55 + ch.score * 0.45) : sScore);
  const gBanda = integ?.banda ?? bandaOf(global);
  return (
    <div className="flex flex-col gap-4">
      <Section icon={<BarChart3 size={15} />} title="Score integrado — Sandler + Challenger">
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-xl border border-border bg-black/[0.02] p-3 text-center"><p className="text-[11px] text-text-muted">Sandler (mecanica)</p><p className={`mt-1 text-2xl font-bold ${BAND_TEXT[sBanda]}`}>{sScore}<span className="text-xs text-text-muted">/100</span></p></div>
          <div className="rounded-xl border border-border bg-black/[0.02] p-3 text-center"><p className="text-[11px] text-text-muted">Challenger (reto)</p><p className={`mt-1 text-2xl font-bold ${ch ? BAND_TEXT[ch.banda] : "text-text-muted"}`}>{ch ? ch.score : "—"}<span className="text-xs text-text-muted">/100</span></p></div>
          <div className="rounded-xl border border-accent/30 bg-accent/[0.06] p-3 text-center"><p className="text-[11px] text-text-muted">Indice global</p><p className={`mt-1 text-2xl font-bold ${BAND_TEXT[gBanda]}`}>{global}<span className="text-xs text-text-muted">/100</span></p></div>
        </div>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-black/10"><div className={`h-full rounded-full ${BAND_BAR[gBanda]}`} style={{ width: `${global}%` }} /></div>
      </Section>
      {integ ? (
        <>
          <Section icon={<Sparkles size={15} />} title="Resumen ejecutivo potenciado">
            <p className="text-[13px] leading-relaxed text-text">{integ.resumenEjecutivo}</p>
            <p className="mt-3 text-[13px] leading-relaxed text-text-muted"><span className="font-semibold text-text">Diagnostico: </span>{integ.diagnostico}</p>
          </Section>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <TwoColList icon="✅" title="Fortalezas clave" items={integ.fortalezasClave} color="text-success" />
            <TwoColList icon="⚠️" title="Riesgos" items={integ.riesgos} color="text-danger" />
          </div>
          {integ.planAccion.length > 0 && (
            <Section icon={<Target size={15} />} title="Plan de accion integrado">
              <div className="flex flex-col gap-2">
                {integ.planAccion.map((a, i) => (
                  <div key={i} className="flex items-start gap-2 text-[13px]"><span className={`mt-0.5 shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${PRIO_CHIP[a.prioridad]}`}>{a.prioridad}</span><span className="text-text">{a.accion}</span></div>
                ))}
              </div>
              <div className="mt-3 rounded-lg border border-success/40 bg-success/[0.06] p-3 text-[13px]"><span className="font-semibold text-success">📞 Proxima llamada: </span>{integ.proximaLlamada}</div>
            </Section>
          )}
        </>
      ) : (
        <Section icon={<Sparkles size={15} />} title="Resumen integrado">
          <p className="text-[13px] leading-relaxed text-text-muted">{ch ? `Sandler ${sScore}/100 mide la mecanica; Challenger ${ch.score}/100 mide el reto comercial.` : "Cuando exista el analisis Challenger, aqui veras el comparativo."}</p>
        </Section>
      )}
    </div>
  );
}

const TABS = ["llamada", "vendedor", "sandler", "challenger", "analiticas"] as const;
type CallTab = typeof TABS[number];
const TAB_LABEL: Record<CallTab, string> = { llamada: "Llamada", vendedor: "Vendedor", sandler: "Sandler", challenger: "Challenger", analiticas: "Analiticas" };

export function CallAnalysisTabs({ call }: { call: CallAnalysisData }) {
  const [tab, setTab] = useState<CallTab>("llamada");
  return (
    <div>
      <div className="mb-4 flex flex-wrap gap-1 border-b border-border">
        {TABS.map((k) => (
          <button key={k} onClick={() => setTab(k)}
            className={`border-b-2 px-3.5 py-2.5 text-[12px] font-medium uppercase tracking-wide transition-colors ${tab === k ? "border-accent text-accent" : "border-transparent text-text-muted hover:text-text"}`}>
            {TAB_LABEL[k]}
          </button>
        ))}
      </div>
      {tab === "llamada" && <LlamadaView call={call} />}
      {tab === "vendedor" && <VendedorView v={call.vendedor} />}
      {tab === "sandler" && <SandlerView call={call} />}
      {tab === "challenger" && <ChallengerView ch={call.challenger} />}
      {tab === "analiticas" && <AnaliticasView call={call} />}
    </div>
  );
}
