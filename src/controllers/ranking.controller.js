import { getTopProductos } from "../services/ranking.service.js";

export async function getRankingTop(req, res) {
  try {
    const pool = req.app.locals.pool;

    const { desde, hasta, limit } = req.query;

    const data = await getTopProductos(pool, {
      desde,
      hasta,
      limit: limit || 10,
    });

    return res.json({ ok: true, data });
  } catch (err) {
    console.error("getRankingTop error:", err);
    return res.status(500).json({ ok: false, error: "Error interno" });
  }
}