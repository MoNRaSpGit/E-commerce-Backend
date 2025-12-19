export async function obtenerProductos(req, res) {
  try {
    const { pool } = req.app.locals;
    const [rows] = await pool.query(
      "SELECT * FROM productos_test LIMIT 10"
    );

    res.json({
      ok: true,
      data: rows
    });
  } catch (err) {
    res.status(500).json({
      ok: false,
      error: err.message
    });
  }
}
/*dfdsfsfdssd */