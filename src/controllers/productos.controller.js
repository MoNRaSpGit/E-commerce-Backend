export async function obtenerProductos(req, res) {
  try {
    const pool = req.app.locals.pool;

    const [rows] = await pool.query(
      "SELECT * FROM productos_test LIMIT 10"
    );

    return res.json({
      ok: true,
      data: rows,
    });
  } catch (err) {
    console.error("Error obtenerProductos:", err);
    return res.status(500).json({
      ok: false,
      error: "Error al obtener productos",
    });
  }
}
