import { Router } from "express";
import { db } from "../db/index.js";
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
  orden: number; publicado: number;
}
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
      `SELECT id, titulo, descripcion, etapa_sandler, orden, publicado
         FROM courses ${todos ? "" : "WHERE publicado = 1"}
        ORDER BY orden ASC, id ASC`
    );
    const lecciones = await db.query<LessonRow>(
      `SELECT id, course_id, titulo, contenido, video_url, etapa_sandler, duracion_min, orden
         FROM lessons ORDER BY orden ASC, id ASC`
    );
    const done = await completadasDe(vendedor);

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
      return {
        id: c.id,
        titulo: c.titulo,
        descripcion: c.descripcion,
        etapaSandler: c.etapa_sandler,
        publicado: Boolean(c.publicado),
        lecciones: ls,
        progreso: ls.length ? Math.round((completadas / ls.length) * 100) : 0,
        completadas,
        total: ls.length
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
