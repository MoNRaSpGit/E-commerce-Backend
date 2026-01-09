import { emitStaff } from "../realtime/pedidosHub.js";



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

/**
 * PATCH /api/productos/:id/stock
 * Body: { delta: number }  // ej: +5 repone, -2 descuenta
 * Admin / Operario
 */
export async function ajustarStockProducto(req, res) {
  try {
    const pool = req.app.locals.pool;
    const id = Number(req.params.id);

    if (!id) return res.status(400).json({ ok: false, error: "ID inválido" });

    const deltaRaw = req.body?.delta;
    const delta = Number(deltaRaw);

    if (!Number.isFinite(delta) || delta === 0) {
      return res.status(400).json({
        ok: false,
        error: "delta inválido (debe ser número distinto de 0)",
      });
    }

    // 1) Update seguro (si baja, no permitir negativo)
    let r;
    if (delta < 0) {
      const abs = Math.abs(delta);
      [r] = await pool.query(
        `UPDATE productos_test
         SET stock = stock - ?
         WHERE id = ? AND stock >= ?`,
        [abs, id, abs]
      );
      if (!r.affectedRows) {
        return res.status(409).json({
          ok: false,
          error: "Sin stock suficiente para descontar",
        });
      }
    } else {
      [r] = await pool.query(
        `UPDATE productos_test
         SET stock = stock + ?
         WHERE id = ?`,
        [delta, id]
      );
      if (!r.affectedRows) {
        return res.status(404).json({ ok: false, error: "Producto no encontrado" });
      }
    }

    // 2) Leer stock final
    const [[row]] = await pool.query(
      `SELECT stock FROM productos_test WHERE id = ? LIMIT 1`,
      [id]
    );

    const stockActual = Number(row?.stock ?? 0);

    // 3) Calcular nivel
    let nivel = "ok";
    if (stockActual <= 1) nivel = "critico";
    else if (stockActual <= 3) nivel = "bajo";

    // 4) Guardar histórico si quedó bajo/crítico
    if (nivel !== "ok") {
      await pool.query(
        `INSERT INTO eco_reposicion_alerta (producto_id, stock_en_evento, nivel)
         VALUES (?, ?, ?)`,
        [id, stockActual, nivel]
      );
    }

    // 5) Emitir SSE a staff (operario/admin)
    emitStaff("reposicion_update", {
      productoId: id,
      stock: stockActual,
      nivel, // "critico" | "bajo" | "ok"
      delta,
      at: new Date().toISOString(),
    });

    return res.json({
      ok: true,
      data: { productoId: id, stock: stockActual, nivel },
    });
  } catch (err) {
    console.error("Error ajustarStockProducto:", err);
    return res.status(500).json({
      ok: false,
      error: "Error al ajustar stock",
    });
  }
}

