// backend/src/controllers/analytics.controller.js

import { getTopProducts, getSummary } from "../services/analytics.service.js";
import {
  addOperarioStatusClient,
  removeOperarioStatusClient,
  emitOperarioStatus,
} from "../realtime/operarioStatusHub.js";


export async function topProducts(req, res) {
  try {
    const pool = req.app.locals.pool;

    const days = Number(req.query.days) || 7;
    const limit = Number(req.query.limit) || 10;

    const data = await getTopProducts(pool, { days, limit });

    return res.json({
      ok: true,
      range: {
        days,
        from: new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString(),
        to: new Date().toISOString(),
      },
      data,
    });
  } catch (err) {
    console.error("analytics topProducts error:", err);
    return res
      .status(500)
      .json({ ok: false, error: "Error interno del servidor" });
  }
}

export async function summary(req, res) {
  try {
    const pool = req.app.locals.pool;

    const days = Number(req.query.days) || 7;

    const data = await getSummary(pool, { days });

    return res.json({
      ok: true,
      range: { days },
      ...data,
    });
  } catch (err) {
    console.error("analytics summary error:", err);
    return res
      .status(500)
      .json({ ok: false, error: "Error interno del servidor" });
  }
}


/**
 * GET /api/analytics/operario-status/stream
 * Público: SSE stream de estado operario (real-time)
 */
export async function operarioStatusStream(req, res) {
  try {
    const pool = req.app.locals.pool;

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    // si estás detrás de proxy (Render), ayuda a que salga al toque
    res.flushHeaders?.();

    // 1) mandar estado inicial
    const [rows] = await pool.query(
      `SELECT activo, updated_at FROM eco_operario_estado WHERE id = 1 LIMIT 1`
    );
    const row = rows?.[0];

    const initialPayload = {
      activo: row ? !!row.activo : false,
      updatedAt: row?.updated_at ? new Date(row.updated_at).toISOString() : null,
    };

    res.write(`event: operario_status\ndata: ${JSON.stringify(initialPayload)}\n\n`);

    // 2) registrar cliente
    addOperarioStatusClient(res);

    // 3) keep-alive ping (evita cortes silenciosos)
    const ping = setInterval(() => {
      try {
        res.write(`event: ping\ndata: {}\n\n`);
      } catch { }
    }, 25000);

    // 4) cleanup
    req.on("close", () => {
      clearInterval(ping);
      removeOperarioStatusClient(res);
      try {
        res.end();
      } catch { }
    });
  } catch (err) {
    console.error("operarioStatusStream error:", err);
    return res.status(500).end();
  }
}



// ✅ Estado "Activo/Inactivo" del operario (semaforito)

/**
 * GET /api/analytics/operario-status
 * Público (cliente): devuelve si el operario está activo
 */
export async function operarioStatusPublic(req, res) {
  try {
    const pool = req.app.locals.pool;

    const [rows] = await pool.query(
      `SELECT activo, updated_at FROM eco_operario_estado WHERE id = 1 LIMIT 1`
    );

    const row = rows?.[0];
    const activo = row ? !!row.activo : false;

    // ✅ emitir a todos (real-time)
    /* emitOperarioStatus("operario_status", {
       activo: !!row.activo,
       updatedAt: row?.updated_at ? new Date(row.updated_at).toISOString() : null,
     });*/


    return res.json({
      ok: true,
      activo,
      updatedAt: row?.updated_at ? new Date(row.updated_at).toISOString() : null,
    });
  } catch (err) {
    console.error("operarioStatusPublic error:", err);
    return res.status(500).json({ ok: false, error: "Error interno del servidor" });
  }
}

/**
 * PATCH /api/analytics/operario-status
 * Operario/Admin: setea activo true/false (no toggle ciego)
 * Body: { activo: true/false }
 */
export async function setOperarioStatus(req, res) {
  try {
    const pool = req.app.locals.pool;

    const activo = req.body?.activo;
    if (typeof activo !== "boolean") {
      return res.status(400).json({
        ok: false,
        error: "Body inválido. Enviá { activo: true/false }",
      });
    }

    await pool.query(
      `INSERT INTO eco_operario_estado (id, activo)
       VALUES (1, ?)
       ON DUPLICATE KEY UPDATE activo = VALUES(activo)`,
      [activo ? 1 : 0]
    );

    const [rows] = await pool.query(
      `SELECT activo, updated_at FROM eco_operario_estado WHERE id = 1 LIMIT 1`
    );

    const row = rows?.[0];

    emitOperarioStatus("operario_status", {
      activo: row ? !!row.activo : false,
      updatedAt: row?.updated_at ? new Date(row.updated_at).toISOString() : null,
    });



    return res.json({
      ok: true,
      activo: !!row.activo,
      updatedAt: row?.updated_at ? new Date(row.updated_at).toISOString() : null,
    });
  } catch (err) {
    console.error("setOperarioStatus error:", err);
    return res.status(500).json({ ok: false, error: "Error interno del servidor" });
  }
}

