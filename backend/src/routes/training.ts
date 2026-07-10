import { Router } from "express";
import { db } from "../db/index.js";
import { seedTraining } from "../db/trainingSeed.js";
import { safeParseJson } from "../lib/references.js";
import type { CallIntelligenceOutput } from "../agents/types.js";

// ===========================================================================
//  Entrenamiento (LMS) — cursos y lecciones Sandler.
//
//  Vendedor:
//   GET  /api/training/courses?vendedor=            → cursos publicados + progreso
//   GET  /api/training/lessons/:id                  → contenido completo de una lección
//   POST /api/training/lessons/:id/complete         → { vendedor } marca completada
//   GET  /api/training/recomendaciones?vendedor=    → ruta según su etapa más débil real
//
//  Admin (gestión de contenido):
//   POST/PATCH/DELETE /api/training/courses[/:id]
//   POST /api/training/courses/:id/lessons · PATCH/DELETE /api/training/lessons/:id
//   (?todos=true en GET /courses incluye los no publicados, para el editor)
// ===========================================================================

export const trainingRouter = Router();

const ETAPAS_SANDLER: Record<number, string> = {
  1: "Vínculo y Confianza",
  2: "Contrato Previo (Up-Front)",
  3: "Dolor (Pain)",
  4: "Presupuesto (Budget)",
  5: "Decisión",
  6: "Cierre / Cumplimiento",
  7: "Post-Venta"
};

interface CourseRow {
  id: number; titulo: string; descripcion: string | null; etapa_sandler: number | null;
  orden: number; publicado: number; quiz: string | null;
}

interface QuizQuestion {
  pregunta: string; opciones: string[]; correcta: number; explicacion: string;
}

const APROBACION = 0.8; // 80% para aprobar el quiz del módulo
interface LessonRow {
  id: number; course_id: number; titulo: string; contenido: string; video_url: string | null;
  etapa_sandler: number | null; duracion_min: number | null; orden: number;
}

const avg = (ns: number[]) => (ns.length ? Math.round(ns.reduce((s, n) => s + n, 0) / ns.length) : 0);

/** Etapa Sandler más débil del vendedor (por sus llamadas evaluables en call_analyses). */
async function etapaMasDebilDe(vendedor: string | null): Promise<{ id: number; nombre: string; promedio: number; fuente: "vendedor" | "equipo" } | null> {
  const rows = vendedor
    ? await db.query<{ payload: string }>(`SELECT payload FROM call_analyses WHERE vendedor = ?`, [vendedor])
    : [];
  const fuente: "vendedor" | "equipo" = rows.length ? "vendedor" : "equipo";
  const usar = rows.length
    ? rows
    : await db.query<{ payload: string }>(`SELECT payload FROM call_analyses`);

  const agg = new Map<number, number[]>();
  for (const r of usar) {
    const call = safeParseJson<CallIntelligenceOutput>(r.payload);
    if (!call?.sandler || call.sandler.puntajeFinal <= 0) continue;
    for (const e of call.sandler.etapas ?? []) {
      if (e.estado === "no_aplica") continue;
      const arr = agg.get(e.id) ?? [];
      arr.push(e.puntaje);
      agg.set(e.id, arr);
    }
  }
  if (!agg.size) return null;
  const etapas = [...agg.entries()].map(([id, ps]) => ({ id, promedio: avg(ps) }));
  const debil = etapas.reduce((min, e) => (e.promedio < min.promedio ? e : min));
  return { id: debil.id, nombre: ETAPAS_SANDLER[debil.id] ?? `Etapa ${debil.id}`, promedio: debil.promedio, fuente };
}

/** Set de lecciones completadas por un vendedor. */
async function completadasDe(vendedor: string | null): Promise<Set<number>> {
  if (!vendedor) return new Set();
  const rows = await db.query<{ lesson_id: number }>(
    `SELECT lesson_id FROM lesson_progress WHERE vendedor = ?`,
    [vendedor]
  );
  return new Set(rows.map((r) => r.lesson_id));
}

// ── Vendedor ─────────────────────────────────────────────────────────────────

// GET /api/training/courses?vendedor=&todos=true
trainingRouter.get("/courses", async (req, res) => {
  try {
    const vendedor = (req.query.vendedor as string | undefined)?.trim() || null;
    const todos = req.query.todos === "true"; // editor admin: incluye no publicados
    const cursos = await db.query<CourseRow>(
      `SELECT id, titulo, descripcion, etapa_sandler, orden, publicado, quiz
         FROM courses ${todos ? "" : "WHERE publicado = 1"}
        ORDER BY orden ASC, id ASC`
    );
    const lecciones = await db.query<LessonRow>(
      `SELECT id, course_id, titulo, contenido, video_url, etapa_sandler, duracion_min, orden
         FROM lessons ORDER BY orden ASC, id ASC`
    );
    const done = await completadasDe(vendedor);
    // Quizzes ya aprobados por el vendedor (para mostrar la insignia 📚).
    const quizAprobado = new Map<number, { score: number; total: number; aprobado: boolean }>();
    if (vendedor) {
      const qr = await db.query<{ course_id: number; score: number; total: number; aprobado: number }>(
        `SELECT course_id, score, total, aprobado FROM quiz_results WHERE vendedor = ?`,
        [vendedor]
      );
      for (const r of qr) quizAprobado.set(r.course_id, { score: r.score, total: r.total, aprobado: Boolean(r.aprobado) });
    }

    const out = cursos.map((c) => {
      const ls = lecciones
        .filter((l) => l.course_id === c.id)
        .map((l) => ({
          id: l.id,
          titulo: l.titulo,
          etapaSandler: l.etapa_sandler,
          etapaNombre: l.etapa_sandler ? ETAPAS_SANDLER[l.etapa_sandler] ?? null : null,
          duracionMin: l.duracion_min,
          tieneVideo: Boolean(l.video_url),
          orden: l.orden,
          completada: done.has(l.id)
        }));
      const completadas = ls.filter((l) => l.completada).length;
      const quiz = safeParseJson<QuizQuestion[]>(c.quiz) ?? [];
      const qr = quizAprobado.get(c.id);
      return {
        id: c.id,
        titulo: c.titulo,
        descripcion: c.descripcion,
        etapaSandler: c.etapa_sandler,
        publicado: Boolean(c.publicado),
        lecciones: ls,
        progreso: ls.length ? Math.round((completadas / ls.length) * 100) : 0,
        completadas,
        total: ls.length,
        // Quiz: número de preguntas (nunca las respuestas) + resultado del vendedor.
        quizPreguntas: quiz.length,
        // El quiz se habilita cuando el vendedor completó todas las lecciones.
        quizDisponible: quiz.length > 0 && completadas === ls.length && ls.length > 0,
        quizResultado: qr ? { score: qr.score, total: qr.total, aprobado: qr.aprobado } : null
      };
    });
    res.json({ vendedor, cursos: out });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// GET /api/training/lessons/:id → lección completa (contenido + video).
trainingRouter.get("/lessons/:id", async (req, res) => {
  try {
    const row = await db.queryOne<LessonRow & { curso_titulo: string }>(
      `SELECT l.*, c.titulo as curso_titulo
         FROM lessons l JOIN courses c ON c.id = l.course_id
        WHERE l.id = ?`,
      [Number(req.params.id)]
    );
    if (!row) return res.status(404).json({ error: "Lección no encontrada" });
    res.json({
      id: row.id,
      courseId: row.course_id,
      cursoTitulo: row.curso_titulo,
      titulo: row.titulo,
      contenido: row.contenido,
      videoUrl: row.video_url,
      etapaSandler: row.etapa_sandler,
      etapaNombre: row.etapa_sandler ? ETAPAS_SANDLER[row.etapa_sandler] ?? null : null,
      duracionMin: row.duracion_min
    });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// POST /api/training/lessons/:id/complete { vendedor }
trainingRouter.post("/lessons/:id/complete", async (req, res) => {
  const vendedor = String((req.body ?? {}).vendedor ?? "").trim();
  if (!vendedor) return res.status(400).json({ error: "Falta 'vendedor'." });
  try {
    const lesson = await db.queryOne<{ id: number }>(`SELECT id FROM lessons WHERE id = ?`, [Number(req.params.id)]);
    if (!lesson) return res.status(404).json({ error: "Lección no encontrada" });
    // Idempotente: completar dos veces no duplica.
    await db.run(
      `INSERT INTO lesson_progress (lesson_id, vendedor, completed_at) VALUES (?, ?, ?)
       ON CONFLICT(lesson_id, vendedor) DO NOTHING`,
      [lesson.id, vendedor, new Date().toISOString()]
    );
    res.json({ ok: true, lessonId: lesson.id, vendedor });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// GET /api/training/courses/:id/quiz → preguntas del quiz SIN la respuesta correcta.
trainingRouter.get("/courses/:id/quiz", async (req, res) => {
  try {
    const row = await db.queryOne<{ titulo: string; quiz: string | null }>(
      `SELECT titulo, quiz FROM courses WHERE id = ?`,
      [Number(req.params.id)]
    );
    if (!row) return res.status(404).json({ error: "Curso no encontrado" });
    const quiz = safeParseJson<QuizQuestion[]>(row.quiz) ?? [];
    if (!quiz.length) return res.status(404).json({ error: "Este curso no tiene quiz." });
    res.json({
      cursoTitulo: row.titulo,
      aprobacion: Math.round(APROBACION * 100),
      // Se omite `correcta` y `explicacion` para no filtrar respuestas al cliente.
      preguntas: quiz.map((q, i) => ({ id: i, pregunta: q.pregunta, opciones: q.opciones }))
    });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// POST /api/training/courses/:id/quiz { vendedor, respuestas: number[] }
//   Califica en el servidor y guarda el MEJOR intento. Devuelve el detalle
//   (correcta + explicación) para que el vendedor aprenda de sus errores.
trainingRouter.post("/courses/:id/quiz", async (req, res) => {
  const { vendedor, respuestas } = (req.body ?? {}) as { vendedor?: string; respuestas?: number[] };
  const v = (vendedor ?? "").trim();
  if (!v) return res.status(400).json({ error: "Falta 'vendedor'." });
  if (!Array.isArray(respuestas)) return res.status(400).json({ error: "Falta 'respuestas' (arreglo)." });
  try {
    const row = await db.queryOne<{ quiz: string | null }>(`SELECT quiz FROM courses WHERE id = ?`, [Number(req.params.id)]);
    const quiz = safeParseJson<QuizQuestion[]>(row?.quiz ?? null) ?? [];
    if (!quiz.length) return res.status(404).json({ error: "Este curso no tiene quiz." });

    let score = 0;
    const detalle = quiz.map((q, i) => {
      const elegida = respuestas[i];
      const acierto = elegida === q.correcta;
      if (acierto) score++;
      return { id: i, correcta: q.correcta, elegida, acierto, explicacion: q.explicacion };
    });
    const total = quiz.length;
    const aprobado = score / total >= APROBACION;

    // Guarda solo si mejora el intento previo (o si no había).
    const prev = await db.queryOne<{ score: number }>(
      `SELECT score FROM quiz_results WHERE course_id = ? AND vendedor = ?`,
      [Number(req.params.id), v]
    );
    if (!prev || score > prev.score) {
      await db.run(
        `INSERT INTO quiz_results (course_id, vendedor, score, total, aprobado, completed_at)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(course_id, vendedor) DO UPDATE SET
           score = excluded.score, total = excluded.total,
           aprobado = excluded.aprobado, completed_at = excluded.completed_at`,
        [Number(req.params.id), v, score, total, aprobado ? 1 : 0, new Date().toISOString()]
      );
    }
    res.json({ score, total, aprobado, porcentaje: Math.round((score / total) * 100), detalle });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// GET /api/training/recomendaciones?vendedor= → "Tu ruta": lecciones de su etapa
// más débil (datos reales de sus llamadas), pendientes primero.
trainingRouter.get("/recomendaciones", async (req, res) => {
  try {
    const vendedor = (req.query.vendedor as string | undefined)?.trim() || null;
    const debil = await etapaMasDebilDe(vendedor);
    if (!debil) return res.json({ vendedor, etapaDebil: null, lecciones: [] });

    const done = await completadasDe(vendedor);
    const rows = await db.query<LessonRow & { curso_titulo: string }>(
      `SELECT l.*, c.titulo as curso_titulo
         FROM lessons l JOIN courses c ON c.id = l.course_id
        WHERE c.publicado = 1 AND l.etapa_sandler = ?
        ORDER BY l.orden ASC, l.id ASC`,
      [debil.id]
    );
    res.json({
      vendedor,
      etapaDebil: debil,
      lecciones: rows.map((l) => ({
        id: l.id,
        titulo: l.titulo,
        cursoTitulo: l.curso_titulo,
        duracionMin: l.duracion_min,
        tieneVideo: Boolean(l.video_url),
        completada: done.has(l.id)
      })).sort((a, b) => Number(a.completada) - Number(b.completada))
    });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// ── Admin: gestión de contenido ──────────────────────────────────────────────

trainingRouter.post("/courses", async (req, res) => {
  const { titulo, descripcion, etapaSandler, publicado } = (req.body ?? {}) as Record<string, unknown>;
  if (typeof titulo !== "string" || !titulo.trim()) return res.status(400).json({ error: "Falta 'titulo'." });
  try {
    const now = new Date().toISOString();
    const row = await db.queryOne<{ id: number }>(
      `INSERT INTO courses (titulo, descripcion, etapa_sandler, orden, publicado, created_at, updated_at)
       VALUES (?, ?, ?, (SELECT CAST(COALESCE(MAX(orden),0)+1 AS INTEGER) FROM courses), ?, ?, ?) RETURNING id`,
      [titulo.trim(), typeof descripcion === "string" ? descripcion : null,
       typeof etapaSandler === "number" ? etapaSandler : null, publicado ? 1 : 0, now, now]
    );
    res.status(201).json({ ok: true, id: row?.id });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

trainingRouter.patch("/courses/:id", async (req, res) => {
  const { titulo, descripcion, etapaSandler, publicado, orden } = (req.body ?? {}) as Record<string, unknown>;
  try {
    await db.run(
      `UPDATE courses SET
         titulo = COALESCE(?, titulo),
         descripcion = COALESCE(?, descripcion),
         etapa_sandler = COALESCE(?, etapa_sandler),
         publicado = COALESCE(?, publicado),
         orden = COALESCE(?, orden),
         updated_at = ?
       WHERE id = ?`,
      [
        typeof titulo === "string" ? titulo : null,
        typeof descripcion === "string" ? descripcion : null,
        typeof etapaSandler === "number" ? etapaSandler : null,
        typeof publicado === "boolean" ? (publicado ? 1 : 0) : null,
        typeof orden === "number" ? orden : null,
        new Date().toISOString(),
        Number(req.params.id)
      ]
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

trainingRouter.delete("/courses/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    await db.run(`DELETE FROM lesson_progress WHERE lesson_id IN (SELECT id FROM lessons WHERE course_id = ?)`, [id]);
    await db.run(`DELETE FROM lessons WHERE course_id = ?`, [id]);
    await db.run(`DELETE FROM courses WHERE id = ?`, [id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

trainingRouter.post("/courses/:id/lessons", async (req, res) => {
  const { titulo, contenido, videoUrl, etapaSandler, duracionMin } = (req.body ?? {}) as Record<string, unknown>;
  if (typeof titulo !== "string" || !titulo.trim()) return res.status(400).json({ error: "Falta 'titulo'." });
  if (typeof contenido !== "string" || !contenido.trim()) return res.status(400).json({ error: "Falta 'contenido'." });
  try {
    const courseId = Number(req.params.id);
    const course = await db.queryOne<{ id: number }>(`SELECT id FROM courses WHERE id = ?`, [courseId]);
    if (!course) return res.status(404).json({ error: "Curso no encontrado" });
    const now = new Date().toISOString();
    const row = await db.queryOne<{ id: number }>(
      `INSERT INTO lessons (course_id, titulo, contenido, video_url, etapa_sandler, duracion_min, orden, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, (SELECT CAST(COALESCE(MAX(orden),0)+1 AS INTEGER) FROM lessons WHERE course_id = ?), ?, ?) RETURNING id`,
      [courseId, titulo.trim(), contenido, typeof videoUrl === "string" && videoUrl.trim() ? videoUrl.trim() : null,
       typeof etapaSandler === "number" ? etapaSandler : null,
       typeof duracionMin === "number" ? duracionMin : null, courseId, now, now]
    );
    res.status(201).json({ ok: true, id: row?.id });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

trainingRouter.patch("/lessons/:id", async (req, res) => {
  const { titulo, contenido, videoUrl, etapaSandler, duracionMin, orden } = (req.body ?? {}) as Record<string, unknown>;
  try {
    await db.run(
      `UPDATE lessons SET
         titulo = COALESCE(?, titulo),
         contenido = COALESCE(?, contenido),
         video_url = COALESCE(?, video_url),
         etapa_sandler = COALESCE(?, etapa_sandler),
         duracion_min = COALESCE(?, duracion_min),
         orden = COALESCE(?, orden),
         updated_at = ?
       WHERE id = ?`,
      [
        typeof titulo === "string" ? titulo : null,
        typeof contenido === "string" ? contenido : null,
        typeof videoUrl === "string" ? (videoUrl.trim() || null) : null,
        typeof etapaSandler === "number" ? etapaSandler : null,
        typeof duracionMin === "number" ? duracionMin : null,
        typeof orden === "number" ? orden : null,
        new Date().toISOString(),
        Number(req.params.id)
      ]
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// GET /api/training/adopcion — Fase 3: métricas para gerencia.
//   Por vendedor: avance de lecciones, quizzes aprobados y última actividad
//   (incluye a los que NO han estudiado). Además, CORRELACIÓN: para cada
//   etapa que un vendedor entrenó, su puntaje promedio en esa etapa ANTES de
//   la primera lección completada vs DESPUÉS (con sus llamadas reales).
trainingRouter.get("/adopcion", async (_req, res) => {
  try {
    const totalRow = await db.queryOne<{ c: number }>(
      `SELECT CAST(COUNT(*) AS INTEGER) as c FROM lessons l JOIN courses c2 ON c2.id = l.course_id WHERE c2.publicado = 1`
    );
    const totalLecciones = totalRow?.c ?? 0;
    const totalQuizzesRow = await db.queryOne<{ c: number }>(
      `SELECT CAST(COUNT(*) AS INTEGER) as c FROM courses WHERE publicado = 1 AND quiz IS NOT NULL`
    );
    const totalQuizzes = totalQuizzesRow?.c ?? 0;

    // Universo de vendedores: los que estudian ∪ los que llaman (para ver quién NO estudia).
    const estudian = await db.query<{ vendedor: string; completadas: number; ultima: string }>(
      `SELECT vendedor, CAST(COUNT(*) AS INTEGER) as completadas, MAX(completed_at) as ultima
         FROM lesson_progress GROUP BY vendedor`
    );
    const aprobados = await db.query<{ vendedor: string; aprobados: number }>(
      `SELECT vendedor, CAST(SUM(aprobado) AS INTEGER) as aprobados FROM quiz_results GROUP BY vendedor`
    );
    const llaman = await db.query<{ vendedor: string }>(
      `SELECT DISTINCT vendedor FROM call_analyses WHERE vendedor IS NOT NULL`
    );
    const nombres = new Set<string>([
      ...estudian.map((e) => e.vendedor),
      ...llaman.map((l) => l.vendedor)
    ]);
    const progresoMap = new Map(estudian.map((e) => [e.vendedor, e]));
    const quizMap = new Map(aprobados.map((a) => [a.vendedor, a.aprobados]));

    const vendedores = [...nombres]
      .map((v) => ({
        vendedor: v,
        completadas: progresoMap.get(v)?.completadas ?? 0,
        totalLecciones,
        avancePct: totalLecciones ? Math.round(((progresoMap.get(v)?.completadas ?? 0) / totalLecciones) * 100) : 0,
        quizzesAprobados: quizMap.get(v) ?? 0,
        totalQuizzes,
        ultimaActividad: progresoMap.get(v)?.ultima ?? null
      }))
      .sort((a, b) => b.avancePct - a.avancePct || a.vendedor.localeCompare(b.vendedor));

    // ── Correlación: puntaje por etapa antes/después de entrenarla ──────────
    // Primera lección completada por vendedor+etapa.
    const entrenos = await db.query<{ vendedor: string; etapa: number; desde: string }>(
      `SELECT p.vendedor, l.etapa_sandler as etapa, MIN(p.completed_at) as desde
         FROM lesson_progress p JOIN lessons l ON l.id = p.lesson_id
        WHERE l.etapa_sandler IS NOT NULL
        GROUP BY p.vendedor, l.etapa_sandler`
    );
    // Llamadas evaluables por vendedor (payload con etapas + fecha).
    const callRows = await db.query<{ vendedor: string; payload: string; analyzed_at: string }>(
      `SELECT vendedor, payload, analyzed_at FROM call_analyses WHERE vendedor IS NOT NULL`
    );
    const callsPorVendedor = new Map<string, { etapas: Map<number, number>; ts: string }[]>();
    for (const r of callRows) {
      const call = safeParseJson<CallIntelligenceOutput>(r.payload);
      if (!call?.sandler || call.sandler.puntajeFinal <= 0) continue;
      const etapas = new Map<number, number>();
      for (const e of call.sandler.etapas ?? []) {
        if (e.estado !== "no_aplica") etapas.set(e.id, e.puntaje);
      }
      const arr = callsPorVendedor.get(r.vendedor) ?? [];
      arr.push({ etapas, ts: r.analyzed_at });
      callsPorVendedor.set(r.vendedor, arr);
    }

    const correlaciones = [];
    for (const t of entrenos) {
      const calls = callsPorVendedor.get(t.vendedor) ?? [];
      const antes: number[] = [];
      const despues: number[] = [];
      for (const c of calls) {
        const p = c.etapas.get(t.etapa);
        if (p === undefined) continue;
        (c.ts < t.desde ? antes : despues).push(p);
      }
      // Solo tiene sentido con datos en ambos lados.
      if (!antes.length || !despues.length) continue;
      const pa = avg(antes);
      const pd = avg(despues);
      correlaciones.push({
        vendedor: t.vendedor,
        etapaId: t.etapa,
        etapaNombre: ETAPAS_SANDLER[t.etapa] ?? `Etapa ${t.etapa}`,
        entrenadaDesde: t.desde,
        antes: pa,
        despues: pd,
        delta: pd - pa,
        llamadasAntes: antes.length,
        llamadasDespues: despues.length
      });
    }
    correlaciones.sort((a, b) => b.delta - a.delta);

    res.json({ totalLecciones, totalQuizzes, vendedores, correlaciones });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// POST /api/training/reseed { confirm: true }
//   Reemplaza TODO el contenido por la versión más reciente del seed (código),
//   CONSERVANDO el progreso y los quizzes aprobados de los vendedores (se
//   re-vinculan por título de lección / de curso). Ojo: las ediciones manuales
//   de los admins sobre los cursos sembrados se pierden — es para actualizar
//   el contenido base cuando sale una versión nueva.
trainingRouter.post("/reseed", async (req, res) => {
  const { confirm } = (req.body ?? {}) as { confirm?: boolean };
  if (confirm !== true) {
    return res.status(400).json({ error: 'Confirmación requerida: envía {"confirm": true}. Reemplaza el contenido conservando el progreso.' });
  }
  try {
    // 1) Progreso actual, re-vinculable por título.
    const progreso = await db.query<{ titulo: string; vendedor: string; completed_at: string }>(
      `SELECT l.titulo, p.vendedor, p.completed_at
         FROM lesson_progress p JOIN lessons l ON l.id = p.lesson_id`
    );
    const quizzes = await db.query<{ titulo: string; vendedor: string; score: number; total: number; aprobado: number; completed_at: string }>(
      `SELECT c.titulo, q.vendedor, q.score, q.total, q.aprobado, q.completed_at
         FROM quiz_results q JOIN courses c ON c.id = q.course_id`
    );

    // 2) Borrar y re-sembrar la versión nueva.
    await db.run(`DELETE FROM lesson_progress`);
    await db.run(`DELETE FROM quiz_results`);
    await db.run(`DELETE FROM lessons`);
    await db.run(`DELETE FROM courses`);
    await seedTraining();

    // 3) Restaurar progreso por título (lo que ya no exista, se omite).
    let lecRestauradas = 0;
    for (const p of progreso) {
      const row = await db.queryOne<{ id: number }>(`SELECT id FROM lessons WHERE titulo = ?`, [p.titulo]);
      if (!row) continue;
      await db.run(
        `INSERT INTO lesson_progress (lesson_id, vendedor, completed_at) VALUES (?, ?, ?)
         ON CONFLICT(lesson_id, vendedor) DO NOTHING`,
        [row.id, p.vendedor, p.completed_at]
      );
      lecRestauradas++;
    }
    let quizRestaurados = 0;
    for (const q of quizzes) {
      const row = await db.queryOne<{ id: number }>(`SELECT id FROM courses WHERE titulo = ?`, [q.titulo]);
      if (!row) continue;
      await db.run(
        `INSERT INTO quiz_results (course_id, vendedor, score, total, aprobado, completed_at)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(course_id, vendedor) DO NOTHING`,
        [row.id, q.vendedor, q.score, q.total, q.aprobado, q.completed_at]
      );
      quizRestaurados++;
    }

    res.json({ ok: true, progresoRestaurado: lecRestauradas, quizzesRestaurados: quizRestaurados });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

trainingRouter.delete("/lessons/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    await db.run(`DELETE FROM lesson_progress WHERE lesson_id = ?`, [id]);
    await db.run(`DELETE FROM lessons WHERE id = ?`, [id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});
