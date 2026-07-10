import { useCallback, useEffect, useMemo, useState } from "react";
import { marked } from "marked";
import {
  BookOpen, PlayCircle, CheckCircle2, Circle, Target, ChevronLeft, Clock,
  Plus, Pencil, Trash2, Eye, EyeOff, GraduationCap, Save, X, Award, XCircle, RotateCcw
} from "lucide-react";
import { api } from "../lib/api";
import { useRole } from "../lib/useRole";
import type { TrainingCourse, TrainingLesson, TrainingRecs, QuizForm, QuizResult } from "../types";

// ===========================================================================
//  Entrenamiento — LMS Sandler.
//  Vendedor: ruta recomendada (según SU etapa más débil real en llamadas),
//  cursos con progreso y visor de lección (Markdown + video embebido).
//  Admin: gestión de cursos/lecciones (crear, editar, publicar, borrar).
// ===========================================================================

const ETAPAS: { id: number; nombre: string }[] = [
  { id: 1, nombre: "Vínculo y Confianza" },
  { id: 2, nombre: "Contrato Previo (Up-Front)" },
  { id: 3, nombre: "Dolor (Pain)" },
  { id: 4, nombre: "Presupuesto (Budget)" },
  { id: 5, nombre: "Decisión" },
  { id: 6, nombre: "Cierre / Cumplimiento" },
  { id: 7, nombre: "Post-Venta" }
];

/** URL de YouTube (watch/youtu.be/shorts) → URL embebible. Otros dominios: null. */
function youtubeEmbed(url: string | null): string | null {
  if (!url) return null;
  const m = url.match(/(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/)|youtu\.be\/)([A-Za-z0-9_-]{6,})/);
  return m ? `https://www.youtube.com/embed/${m[1]}` : null;
}

/** El progreso se registra por nombre de vendedor (el mismo del Coaching). */
function useVendedor(): [string, (v: string) => void] {
  const { user } = useRole();
  const [vendedor, setVendedor] = useState<string>(() => localStorage.getItem("training.vendedor") ?? "");
  useEffect(() => {
    if (!vendedor && user?.name && user.name !== "Usuario de prueba") setVendedor(user.name);
  }, [user, vendedor]);
  const set = (v: string) => {
    setVendedor(v);
    localStorage.setItem("training.vendedor", v);
  };
  return [vendedor, set];
}

function ProgressBar({ pct }: { pct: number }) {
  const color = pct >= 100 ? "bg-success" : pct > 0 ? "bg-accent" : "bg-border";
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-black/10">
      <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${Math.max(pct, 2)}%` }} />
    </div>
  );
}

export function Training() {
  const { isAdmin } = useRole();
  const [vendedor, setVendedor] = useVendedor();
  const [cursos, setCursos] = useState<TrainingCourse[]>([]);
  const [recs, setRecs] = useState<TrainingRecs | null>(null);
  const [vendedores, setVendedores] = useState<string[]>([]);
  const [leccion, setLeccion] = useState<TrainingLesson | null>(null);
  const [quiz, setQuiz] = useState<{ courseId: number; form: QuizForm } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [gestionar, setGestionar] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [c, r] = await Promise.all([
        api.getCourses(vendedor || undefined, isAdmin && gestionar),
        api.getTrainingRecs(vendedor || undefined)
      ]);
      setCursos(c.cursos);
      setRecs(r);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [vendedor, isAdmin, gestionar]);

  useEffect(() => { load(); }, [load]);

  // Lista de vendedores conocidos (para el selector de identidad).
  useEffect(() => {
    api.getCoaching()
      .then((d) => setVendedores((d.porVendedor ?? []).map((v) => v.vendedor).filter((v) => v !== "Sin identificar")))
      .catch(() => setVendedores([]));
  }, []);

  const abrirLeccion = async (id: number) => {
    try {
      setLeccion(await api.getLesson(id));
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const completar = async (id: number) => {
    if (!vendedor) return;
    await api.completeLesson(id, vendedor);
    setLeccion(null);
    load();
  };

  const abrirQuiz = async (courseId: number) => {
    try {
      const form = await api.getQuiz(courseId);
      setQuiz({ courseId, form });
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const totalLecciones = useMemo(() => cursos.reduce((s, c) => s + c.total, 0), [cursos]);
  const totalCompletadas = useMemo(() => cursos.reduce((s, c) => s + c.completadas, 0), [cursos]);

  // ── Quiz del módulo ──────────────────────────────────────────────────────────
  if (quiz) {
    return (
      <QuizView
        courseId={quiz.courseId}
        form={quiz.form}
        vendedor={vendedor}
        onClose={() => { setQuiz(null); load(); }}
      />
    );
  }

  // ── Visor de lección ────────────────────────────────────────────────────────
  if (leccion) {
    const embed = youtubeEmbed(leccion.videoUrl);
    const completada = cursos.some((c) => c.lecciones.some((l) => l.id === leccion.id && l.completada));
    return (
      <div className="mx-auto max-w-3xl">
        <button onClick={() => setLeccion(null)} className="mb-4 flex items-center gap-1.5 text-sm text-text-muted hover:text-text">
          <ChevronLeft size={15} /> Volver al entrenamiento
        </button>
        <div className="rounded-2xl border border-border bg-surface p-6">
          <div className="mb-1 text-xs font-medium uppercase tracking-wide text-text-muted">{leccion.cursoTitulo}</div>
          <h1 className="text-xl font-bold text-text">{leccion.titulo}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-text-muted">
            {leccion.etapaNombre && (
              <span className="rounded-full bg-accent/10 px-2 py-0.5 font-medium text-accent">Etapa {leccion.etapaSandler}: {leccion.etapaNombre}</span>
            )}
            {leccion.duracionMin && <span className="flex items-center gap-1"><Clock size={12} /> {leccion.duracionMin} min</span>}
          </div>

          {embed && (
            <div className="mt-4 aspect-video w-full overflow-hidden rounded-xl border border-border">
              <iframe src={embed} title={leccion.titulo} className="h-full w-full" allowFullScreen allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" />
            </div>
          )}
          {leccion.videoUrl && !embed && (
            <a href={leccion.videoUrl} target="_blank" rel="noreferrer" className="mt-4 inline-flex items-center gap-2 text-sm text-accent hover:underline">
              <PlayCircle size={16} /> Ver video de la lección
            </a>
          )}

          {/* Contenido creado por admins del equipo (Markdown de confianza). */}
          <div className="lesson-md mt-5" dangerouslySetInnerHTML={{ __html: marked.parse(leccion.contenido) as string }} />

          <div className="mt-6 border-t border-border pt-4">
            {vendedor ? (
              completada ? (
                <div className="flex items-center gap-2 text-sm font-medium text-success"><CheckCircle2 size={18} /> Lección completada</div>
              ) : (
                <button onClick={() => completar(leccion.id)} className="inline-flex items-center gap-2 rounded-xl bg-success px-5 py-2.5 text-sm font-medium text-white hover:opacity-90">
                  <CheckCircle2 size={16} /> Marcar como completada
                </button>
              )
            ) : (
              <p className="text-xs text-text-muted">Elige tu nombre arriba para registrar tu avance.</p>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ── Vista principal ─────────────────────────────────────────────────────────
  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-text">
            <BookOpen className="text-accent" /> Entrenamiento Sandler
          </h1>
          <p className="mt-1 text-sm text-text-muted">
            Lecciones alineadas a la misma rúbrica con la que la IA evalúa tus llamadas.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={vendedor}
            onChange={(e) => setVendedor(e.target.value)}
            className="h-9 rounded-lg border border-border bg-surface px-2 text-sm text-text-muted focus:outline-none focus:ring-1 focus:ring-accent"
            title="Tu avance se guarda con este nombre (el mismo del Coaching)"
          >
            <option value="">¿Quién estudia?</option>
            {vendedores.map((v) => <option key={v} value={v}>{v}</option>)}
            {vendedor && !vendedores.includes(vendedor) && <option value={vendedor}>{vendedor}</option>}
          </select>
          {isAdmin && (
            <button
              onClick={() => setGestionar((g) => !g)}
              className={`inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-sm font-medium ${gestionar ? "bg-accent text-white" : "border border-border text-text-muted hover:text-text"}`}
            >
              <Pencil size={14} /> {gestionar ? "Cerrar gestión" : "Gestionar cursos"}
            </button>
          )}
        </div>
      </div>

      {error && <div className="mb-4 rounded-lg border border-danger/20 bg-danger/10 px-4 py-3 text-sm text-danger">{error}</div>}
      {loading && <div className="py-16 text-center text-sm text-text-muted">Cargando entrenamiento…</div>}

      {!loading && (
        <>
          {/* Tu ruta recomendada */}
          {!gestionar && recs?.etapaDebil && recs.lecciones.length > 0 && (
            <div className="mb-5 rounded-2xl border border-accent/25 bg-accent/[0.04] p-5">
              <div className="flex items-center gap-2 text-sm font-semibold text-text">
                <Target size={16} className="text-accent" /> Tu ruta recomendada
              </div>
              <p className="mt-1 text-xs text-text-muted">
                {recs.etapaDebil.fuente === "vendedor"
                  ? <>Según tus llamadas reales, tu etapa más débil es <strong className="text-text">{recs.etapaDebil.nombre}</strong> (promedio {recs.etapaDebil.promedio}/100). Estas lecciones la trabajan:</>
                  : <>La etapa más débil del equipo es <strong className="text-text">{recs.etapaDebil.nombre}</strong> ({recs.etapaDebil.promedio}/100). Empieza por aquí:</>}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {recs.lecciones.map((l) => (
                  <button
                    key={l.id}
                    onClick={() => abrirLeccion(l.id)}
                    className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium ring-1 transition-colors ${
                      l.completada ? "bg-success/10 text-success ring-success/25" : "bg-surface text-text ring-border hover:ring-accent"
                    }`}
                  >
                    {l.completada ? <CheckCircle2 size={13} /> : <Circle size={13} />}
                    {l.titulo}
                    {l.duracionMin ? <span className="text-text-muted">· {l.duracionMin} min</span> : null}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Resumen de avance */}
          {!gestionar && vendedor && totalLecciones > 0 && (
            <div className="mb-5 flex items-center gap-4 rounded-xl border border-border bg-surface px-4 py-3">
              <GraduationCap size={18} className="shrink-0 text-accent" />
              <div className="flex-1">
                <div className="mb-1 flex justify-between text-xs text-text-muted">
                  <span>Avance de {vendedor}</span>
                  <span>{totalCompletadas} de {totalLecciones} lecciones</span>
                </div>
                <ProgressBar pct={totalLecciones ? (totalCompletadas / totalLecciones) * 100 : 0} />
              </div>
            </div>
          )}

          {/* Cursos */}
          {gestionar && isAdmin
            ? <AdminCursos cursos={cursos} onChanged={load} />
            : (
              <div className="grid gap-4 lg:grid-cols-1">
                {cursos.map((c) => (
                  <div key={c.id} className="rounded-2xl border border-border bg-surface p-5">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <h2 className="text-base font-bold text-text">{c.titulo}</h2>
                        {c.descripcion && <p className="mt-0.5 text-sm text-text-muted">{c.descripcion}</p>}
                      </div>
                      <div className="w-40 shrink-0">
                        <div className="mb-1 text-right text-xs text-text-muted">{c.progreso}%</div>
                        <ProgressBar pct={c.progreso} />
                      </div>
                    </div>
                    <ul className="mt-4 divide-y divide-border/60">
                      {c.lecciones.map((l) => (
                        <li key={l.id}>
                          <button onClick={() => abrirLeccion(l.id)} className="flex w-full items-center gap-3 py-2.5 text-left text-sm hover:bg-black/[0.02]">
                            {l.completada
                              ? <CheckCircle2 size={17} className="shrink-0 text-success" />
                              : <Circle size={17} className="shrink-0 text-text-muted/50" />}
                            <span className={`flex-1 ${l.completada ? "text-text-muted line-through decoration-border" : "text-text"}`}>{l.titulo}</span>
                            {l.tieneVideo && <PlayCircle size={14} className="shrink-0 text-accent" />}
                            {l.duracionMin && <span className="shrink-0 text-xs text-text-muted">{l.duracionMin} min</span>}
                            {l.etapaSandler && <span className="hidden shrink-0 rounded-full bg-accent/10 px-2 py-0.5 text-[10px] font-medium text-accent sm:inline">E{l.etapaSandler}</span>}
                          </button>
                        </li>
                      ))}
                    </ul>

                    {/* Quiz del módulo (fase 2): se habilita al completar todas las lecciones. */}
                    {c.quizPreguntas > 0 && (
                      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-bg/50 px-4 py-3">
                        <div className="flex items-center gap-2 text-sm">
                          <Award size={16} className={c.quizResultado?.aprobado ? "text-success" : "text-accent"} />
                          <span className="font-medium text-text">Quiz del módulo</span>
                          <span className="text-text-muted">· {c.quizPreguntas} preguntas</span>
                          {c.quizResultado && (
                            <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${c.quizResultado.aprobado ? "bg-success/15 text-success" : "bg-warning/15 text-warning"}`}>
                              {c.quizResultado.aprobado ? "📚 Aprobado" : "Reprobado"} {c.quizResultado.score}/{c.quizResultado.total}
                            </span>
                          )}
                        </div>
                        <button
                          onClick={() => abrirQuiz(c.id)}
                          disabled={!c.quizDisponible && !c.quizResultado}
                          title={!c.quizDisponible && !c.quizResultado ? "Completa todas las lecciones para desbloquear el quiz" : ""}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-white disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          {c.quizResultado ? <><RotateCcw size={13} /> Reintentar</> : <><Award size={13} /> Presentar quiz</>}
                        </button>
                      </div>
                    )}
                  </div>
                ))}
                {cursos.length === 0 && (
                  <div className="rounded-xl border border-border bg-surface py-16 text-center text-sm text-text-muted">
                    Aún no hay cursos publicados.
                  </div>
                )}
              </div>
            )}
        </>
      )}
    </div>
  );
}

// ── Gestión (admin): crear/editar/publicar/borrar cursos y lecciones ──────────

function AdminCursos({ cursos, onChanged }: { cursos: TrainingCourse[]; onChanged: () => void }) {
  const [nuevoCurso, setNuevoCurso] = useState({ titulo: "", descripcion: "" });
  const [editLesson, setEditLesson] = useState<{ courseId: number; lessonId: number | null } | null>(null);
  const [form, setForm] = useState({ titulo: "", contenido: "", videoUrl: "", etapaSandler: 0, duracionMin: 10 });
  const [busy, setBusy] = useState(false);

  const crearCurso = async () => {
    if (!nuevoCurso.titulo.trim()) return;
    setBusy(true);
    try {
      await api.createCourse({ titulo: nuevoCurso.titulo.trim(), descripcion: nuevoCurso.descripcion.trim() || undefined });
      setNuevoCurso({ titulo: "", descripcion: "" });
      onChanged();
    } finally { setBusy(false); }
  };

  const abrirEditor = async (courseId: number, lessonId: number | null) => {
    if (lessonId) {
      const l = await api.getLesson(lessonId);
      setForm({ titulo: l.titulo, contenido: l.contenido, videoUrl: l.videoUrl ?? "", etapaSandler: l.etapaSandler ?? 0, duracionMin: l.duracionMin ?? 10 });
    } else {
      setForm({ titulo: "", contenido: "", videoUrl: "", etapaSandler: 0, duracionMin: 10 });
    }
    setEditLesson({ courseId, lessonId });
  };

  const guardarLeccion = async () => {
    if (!editLesson || !form.titulo.trim() || !form.contenido.trim()) return;
    setBusy(true);
    try {
      const data = {
        titulo: form.titulo.trim(),
        contenido: form.contenido,
        videoUrl: form.videoUrl.trim() || undefined,
        etapaSandler: form.etapaSandler || undefined,
        duracionMin: form.duracionMin || undefined
      };
      if (editLesson.lessonId) await api.updateLesson(editLesson.lessonId, data);
      else await api.createLesson(editLesson.courseId, data);
      setEditLesson(null);
      onChanged();
    } finally { setBusy(false); }
  };

  if (editLesson) {
    return (
      <div className="rounded-2xl border border-border bg-surface p-5">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-text">{editLesson.lessonId ? "Editar lección" : "Nueva lección"}</h3>
          <button onClick={() => setEditLesson(null)} className="text-text-muted hover:text-text"><X size={16} /></button>
        </div>
        <div className="grid gap-3">
          <input value={form.titulo} onChange={(e) => setForm({ ...form, titulo: e.target.value })} placeholder="Título de la lección"
            className="h-10 rounded-xl border border-border bg-bg px-4 text-sm focus:outline-none focus:ring-1 focus:ring-accent" />
          <div className="grid gap-3 sm:grid-cols-3">
            <input value={form.videoUrl} onChange={(e) => setForm({ ...form, videoUrl: e.target.value })} placeholder="URL de video (YouTube, opcional)"
              className="h-10 rounded-xl border border-border bg-bg px-4 text-sm focus:outline-none focus:ring-1 focus:ring-accent sm:col-span-2" />
            <div className="flex gap-2">
              <select value={form.etapaSandler} onChange={(e) => setForm({ ...form, etapaSandler: Number(e.target.value) })}
                className="h-10 flex-1 rounded-xl border border-border bg-bg px-2 text-sm focus:outline-none">
                <option value={0}>Sin etapa</option>
                {ETAPAS.map((e) => <option key={e.id} value={e.id}>E{e.id} · {e.nombre}</option>)}
              </select>
              <input type="number" min={1} value={form.duracionMin} onChange={(e) => setForm({ ...form, duracionMin: Number(e.target.value) })}
                className="h-10 w-20 rounded-xl border border-border bg-bg px-2 text-sm focus:outline-none" title="Duración (min)" />
            </div>
          </div>
          <textarea value={form.contenido} onChange={(e) => setForm({ ...form, contenido: e.target.value })} rows={16}
            placeholder={"Contenido en Markdown…\n\n## Título\n- lista\n**negritas**, tablas, > citas"}
            className="rounded-xl border border-border bg-bg px-4 py-3 font-mono text-xs leading-relaxed focus:outline-none focus:ring-1 focus:ring-accent" />
          <div className="flex justify-end gap-2">
            <button onClick={() => setEditLesson(null)} className="rounded-lg border border-border px-4 py-2 text-sm text-text-muted hover:text-text">Cancelar</button>
            <button onClick={guardarLeccion} disabled={busy || !form.titulo.trim() || !form.contenido.trim()}
              className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
              <Save size={14} /> Guardar lección
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-4">
      <div className="rounded-2xl border border-dashed border-border bg-surface p-4">
        <div className="flex flex-col gap-2 sm:flex-row">
          <input value={nuevoCurso.titulo} onChange={(e) => setNuevoCurso({ ...nuevoCurso, titulo: e.target.value })} placeholder="Título del nuevo curso"
            className="h-10 flex-1 rounded-xl border border-border bg-bg px-4 text-sm focus:outline-none focus:ring-1 focus:ring-accent" />
          <input value={nuevoCurso.descripcion} onChange={(e) => setNuevoCurso({ ...nuevoCurso, descripcion: e.target.value })} placeholder="Descripción (opcional)"
            className="h-10 flex-1 rounded-xl border border-border bg-bg px-4 text-sm focus:outline-none focus:ring-1 focus:ring-accent" />
          <button onClick={crearCurso} disabled={busy || !nuevoCurso.titulo.trim()}
            className="inline-flex h-10 items-center gap-2 rounded-xl bg-accent px-4 text-sm font-medium text-white disabled:opacity-50">
            <Plus size={15} /> Crear curso
          </button>
        </div>
        <p className="mt-2 text-[11px] text-text-muted">Los cursos nuevos nacen SIN publicar: los vendedores no los ven hasta que actives "Publicado".</p>
      </div>

      {cursos.map((c) => (
        <div key={c.id} className="rounded-2xl border border-border bg-surface p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-bold text-text">{c.titulo}</h3>
              {c.descripcion && <p className="text-xs text-text-muted">{c.descripcion}</p>}
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={async () => { await api.updateCourse(c.id, { publicado: !c.publicado }); onChanged(); }}
                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ring-1 ${c.publicado ? "bg-success/10 text-success ring-success/25" : "bg-border/50 text-text-muted ring-border"}`}
              >
                {c.publicado ? <Eye size={12} /> : <EyeOff size={12} />} {c.publicado ? "Publicado" : "Borrador"}
              </button>
              <button onClick={() => abrirEditor(c.id, null)} className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1 text-xs text-text-muted hover:text-text">
                <Plus size={12} /> Lección
              </button>
              <button
                onClick={async () => { if (window.confirm(`¿Borrar el curso "${c.titulo}" con sus ${c.total} lecciones y el progreso registrado?`)) { await api.deleteCourse(c.id); onChanged(); } }}
                className="rounded-lg border border-danger/30 px-2 py-1 text-xs text-danger hover:bg-danger/10"
              >
                <Trash2 size={12} />
              </button>
            </div>
          </div>
          <ul className="mt-3 divide-y divide-border/60">
            {c.lecciones.map((l) => (
              <li key={l.id} className="flex items-center gap-3 py-2 text-sm">
                <span className="flex-1 text-text">{l.titulo}</span>
                {l.tieneVideo && <PlayCircle size={13} className="text-accent" />}
                {l.etapaSandler ? <span className="rounded-full bg-accent/10 px-2 py-0.5 text-[10px] text-accent">E{l.etapaSandler}</span> : null}
                <button onClick={() => abrirEditor(c.id, l.id)} className="text-text-muted hover:text-text" title="Editar"><Pencil size={13} /></button>
                <button
                  onClick={async () => { if (window.confirm(`¿Borrar la lección "${l.titulo}"?`)) { await api.deleteLesson(l.id); onChanged(); } }}
                  className="text-danger/70 hover:text-danger" title="Borrar"
                >
                  <Trash2 size={13} />
                </button>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

// ── Quiz del módulo: presentar, calificar en servidor y revisar respuestas ────

function QuizView({ courseId, form, vendedor, onClose }: { courseId: number; form: QuizForm; vendedor: string; onClose: () => void }) {
  const [respuestas, setRespuestas] = useState<Record<number, number>>({});
  const [resultado, setResultado] = useState<QuizResult | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const todas = form.preguntas.length;
  const contestadas = Object.keys(respuestas).length;

  const enviar = async () => {
    if (!vendedor) { setErr("Elige tu nombre para registrar tu resultado."); return; }
    setEnviando(true);
    setErr(null);
    try {
      const arr = form.preguntas.map((p) => respuestas[p.id] ?? -1);
      setResultado(await api.submitQuiz(courseId, vendedor, arr));
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setEnviando(false);
    }
  };

  // Vista de resultados: puntaje + revisión pregunta por pregunta.
  if (resultado) {
    const detalle = new Map(resultado.detalle.map((d) => [d.id, d]));
    return (
      <div className="mx-auto max-w-3xl">
        <button onClick={onClose} className="mb-4 flex items-center gap-1.5 text-sm text-text-muted hover:text-text">
          <ChevronLeft size={15} /> Volver al entrenamiento
        </button>
        <div className={`mb-5 rounded-2xl border p-6 text-center ${resultado.aprobado ? "border-success/30 bg-success/[0.06]" : "border-warning/30 bg-warning/[0.06]"}`}>
          {resultado.aprobado
            ? <Award size={40} className="mx-auto text-success" />
            : <RotateCcw size={40} className="mx-auto text-warning" />}
          <h1 className="mt-2 text-2xl font-bold text-text">{resultado.porcentaje}%</h1>
          <p className="text-sm text-text-muted">{resultado.score} de {resultado.total} correctas · se aprueba con {form.aprobacion}%</p>
          <p className={`mt-1 text-sm font-semibold ${resultado.aprobado ? "text-success" : "text-warning"}`}>
            {resultado.aprobado ? "📚 ¡Módulo aprobado! Ya tienes tu insignia." : "Casi — repasa las lecciones y reinténtalo."}
          </p>
        </div>

        <div className="space-y-3">
          {form.preguntas.map((p, i) => {
            const d = detalle.get(p.id);
            return (
              <div key={p.id} className="rounded-xl border border-border bg-surface p-4">
                <div className="flex items-start gap-2">
                  {d?.acierto ? <CheckCircle2 size={18} className="mt-0.5 shrink-0 text-success" /> : <XCircle size={18} className="mt-0.5 shrink-0 text-danger" />}
                  <p className="text-sm font-medium text-text">{i + 1}. {p.pregunta}</p>
                </div>
                <ul className="mt-2 space-y-1 pl-7 text-sm">
                  {p.opciones.map((op, oi) => {
                    const esCorrecta = oi === d?.correcta;
                    const esElegida = oi === d?.elegida;
                    return (
                      <li key={oi} className={`rounded px-2 py-1 ${esCorrecta ? "bg-success/10 font-medium text-success" : esElegida ? "bg-danger/10 text-danger line-through" : "text-text-muted"}`}>
                        {esCorrecta ? "✓ " : esElegida ? "✗ " : ""}{op}
                      </li>
                    );
                  })}
                </ul>
                {d?.explicacion && <p className="mt-2 pl-7 text-xs italic text-text-muted">💡 {d.explicacion}</p>}
              </div>
            );
          })}
        </div>
        <div className="mt-5 flex justify-center gap-2">
          <button onClick={() => { setResultado(null); setRespuestas({}); }} className="inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm text-text-muted hover:text-text">
            <RotateCcw size={14} /> Reintentar
          </button>
          <button onClick={onClose} className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white">Terminar</button>
        </div>
      </div>
    );
  }

  // Formulario del quiz.
  return (
    <div className="mx-auto max-w-3xl">
      <button onClick={onClose} className="mb-4 flex items-center gap-1.5 text-sm text-text-muted hover:text-text">
        <ChevronLeft size={15} /> Volver al entrenamiento
      </button>
      <div className="mb-4 rounded-2xl border border-accent/25 bg-surface p-5">
        <h1 className="flex items-center gap-2 text-lg font-bold text-text"><Award className="text-accent" /> Quiz — {form.cursoTitulo}</h1>
        <p className="mt-1 text-sm text-text-muted">{todas} preguntas · se aprueba con {form.aprobacion}%. Elige una opción por pregunta.</p>
      </div>

      <div className="space-y-3">
        {form.preguntas.map((p, i) => (
          <div key={p.id} className="rounded-xl border border-border bg-surface p-4">
            <p className="text-sm font-medium text-text">{i + 1}. {p.pregunta}</p>
            <div className="mt-3 space-y-2">
              {p.opciones.map((op, oi) => (
                <label key={oi} className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors ${respuestas[p.id] === oi ? "border-accent bg-accent/5 text-text" : "border-border text-text-muted hover:border-accent/50"}`}>
                  <input type="radio" name={`q${p.id}`} checked={respuestas[p.id] === oi} onChange={() => setRespuestas({ ...respuestas, [p.id]: oi })} className="accent-accent" />
                  {op}
                </label>
              ))}
            </div>
          </div>
        ))}
      </div>

      {err && <div className="mt-4 rounded-lg border border-danger/20 bg-danger/10 px-4 py-2 text-sm text-danger">{err}</div>}
      <div className="mt-5 flex items-center justify-between">
        <span className="text-xs text-text-muted">{contestadas} de {todas} contestadas</span>
        <button onClick={enviar} disabled={enviando || contestadas < todas}
          className="inline-flex items-center gap-2 rounded-xl bg-success px-5 py-2.5 text-sm font-medium text-white disabled:opacity-50">
          <CheckCircle2 size={16} /> {enviando ? "Calificando…" : "Enviar respuestas"}
        </button>
      </div>
    </div>
  );
}
