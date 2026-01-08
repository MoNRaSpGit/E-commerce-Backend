// backend/src/controllers/reposicion.controller.js

/**
 * GET /api/reposicion
 * Admin / Operario
 * Lista historica de alertas de reposicion (stock bajo / critico)
 */
export async function listarReposicion(req, res) {
  try {
    const pool = req.app.locals.pool;

    // limite razonable para demo (podemos ajustar despues)
    const limit = 200;

    const [rows] = await pool.query(
      `
      SELECT
        r.id,
        r.producto_id,
        p.name,
        r.stock_en_evento,
        r.nivel,
        r.created_at
      FROM eco_reposicion_alerta r
      JOIN productos_test p ON p.id = r.producto_id
      ORDER BY
        CASE r.nivel
          WHEN 'critico' THEN 0
          WHEN 'bajo' THEN 1
          ELSE 2
        END,
        r.created_at DESC
      LIMIT ?
      `,
      [limit]
    );

    return res.json({ ok: true, data: rows });
  } catch (err) {
    console.error("Error listarReposicion:", err);
    return res.status(500).json({
      ok: false,
      error: "Error al obtener reposicion",
    });
  }
}
