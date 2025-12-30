/**
 * GET /api/productos
 * Público / cliente
 */
export async function obtenerProductos(req, res) {
  try {
    const pool = req.app.locals.pool;

    const [rows] = await pool.query(
      "SELECT * FROM productos_test WHERE status = 'activo' LIMIT 10"
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

/**
 * GET /api/productos/admin
 * Admin / Operario
 */
export async function obtenerProductosAdmin(req, res) {
  try {
    const pool = req.app.locals.pool;

    const [rows] = await pool.query(
      "SELECT * FROM productos_test ORDER BY id DESC LIMIT 200"
    );

    return res.json({
      ok: true,
      data: rows,
    });
  } catch (err) {
    console.error("Error obtenerProductosAdmin:", err);
    return res.status(500).json({
      ok: false,
      error: "Error al obtener productos (admin)",
    });
  }
}

/**
 * PATCH /api/productos/:id
 * Admin / Operario
 */
export async function actualizarProducto(req, res) {
  try {
    const pool = req.app.locals.pool;
    const id = Number(req.params.id);

    if (!id) {
      return res.status(400).json({ ok: false, error: "ID inválido" });
    }

    const {
      name,
      price,
      image,
      status, // activo | inactivo
    } = req.body || {};

    const fields = [];
    const values = [];

    if (name !== undefined) {
      fields.push("name = ?");
      values.push(name);
    }
    if (price !== undefined) {
      fields.push("price = ?");
      values.push(price);
    }
    if (image !== undefined) {
      fields.push("image = ?");
      values.push(image);
    }
    if (status !== undefined) {
      fields.push("status = ?");
      values.push(status);
    }

    if (fields.length === 0) {
      return res.status(400).json({
        ok: false,
        error: "Nada para actualizar",
      });
    }

    values.push(id);

    const [r] = await pool.query(
      `UPDATE productos_test SET ${fields.join(", ")} WHERE id = ?`,
      values
    );

    if (!r.affectedRows) {
      return res.status(404).json({
        ok: false,
        error: "Producto no encontrado",
      });
    }

    return res.json({
      ok: true,
      id,
    });
  } catch (err) {
    console.error("Error actualizarProducto:", err);
    return res.status(500).json({
      ok: false,
      error: "Error al actualizar producto",
    });
  }
}
