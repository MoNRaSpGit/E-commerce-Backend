// backend/src/controllers/sinstock.controller.js
export async function listarProductosSinStock(req, res) {
  try {
    const pool = req.app.locals.pool;

    const [rows] = await pool.query(`
      SELECT
        id,
        name,
        price,
        status,
        barcode,
        categoria,
        subcategoria,
        stock,
        CASE WHEN image IS NULL OR TRIM(image) = '' THEN 0 ELSE 1 END AS has_image
      FROM productos_test
      WHERE stock <= 0
      ORDER BY has_image DESC, name ASC
    `);

    return res.json({ ok: true, data: rows });
  } catch (err) {
    console.error("listarProductosSinStock error:", err);
    return res.status(500).json({
      ok: false,
      error: "Error al obtener productos sin stock",
    });
  }
}