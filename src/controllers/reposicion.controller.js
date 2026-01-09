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
  p.image,
  p.stock AS stock_actual,
  r.stock_en_evento,
  r.nivel,
  r.created_at
FROM eco_reposicion_alerta r
JOIN (
  SELECT producto_id, MAX(created_at) AS max_created
  FROM eco_reposicion_alerta
  GROUP BY producto_id
) last_evt
  ON last_evt.producto_id = r.producto_id
 AND last_evt.max_created = r.created_at
JOIN productos_test p
  ON p.id = r.producto_id
WHERE p.stock <= 3
ORDER BY
  CASE r.nivel
    WHEN 'critico' THEN 1
    WHEN 'bajo' THEN 2
  END,
  r.created_at DESC;
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
