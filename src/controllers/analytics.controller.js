// backend/src/controllers/analytics.controller.js

import {
  getTopProducts,
  getSummary,
} from "../services/analytics.service.js";

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
