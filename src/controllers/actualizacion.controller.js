function cleanEstado(raw) {
  const s = String(raw || "").trim().toLowerCase();
  if (s === "actualizado") return "actualizado";
  return "pendiente";
}

export async function marcarProducto(req, res) {
  try {
    const pool = req.app.locals.pool;

    const productoId = Number(req.body?.productoId);
    const notaRaw = req.body?.nota;

    if (!Number.isFinite(productoId) || productoId <= 0) {
      return res.status(400).json({ ok: false, error: "productoId inválido" });
    }

    const nota = notaRaw != null ? String(notaRaw).trim().slice(0, 255) : null;
    const userId = Number(req.user?.id);

    // (opcional pero recomendado) Validar que exista el producto
    const [[p]] = await pool.query(
      `SELECT id FROM productos_test WHERE id = ? LIMIT 1`,
      [productoId]
    );
    if (!p) return res.status(404).json({ ok: false, error: "Producto no encontrado" });

    // UPSERT sin warning (alias)
    await pool.query(
      `
      INSERT INTO eco_producto_actualizacion
        (producto_id, marcado_por_usuario_id, nota)
      VALUES
        (?, ?, ?) AS new
      ON DUPLICATE KEY UPDATE
        estado = 'pendiente',
        marcado_por_usuario_id = new.marcado_por_usuario_id,
        nota = new.nota,
        marcado_at = CURRENT_TIMESTAMP,
        actualizado_at = NULL
      `,
      [productoId, userId, nota]
    );

    return res.json({
      ok: true,
      data: { productoId, estado: "pendiente" },
    });
  } catch (err) {
    console.error("marcarProducto error:", err);
    return res.status(500).json({ ok: false, error: "Error interno del servidor" });
  }
}

export async function listar(req, res) {
  try {
    const pool = req.app.locals.pool;

    const estado = cleanEstado(req.query?.estado);

    const [rows] = await pool.query(
      `
      SELECT
        a.producto_id,
        a.estado,
        a.marcado_at,
        a.actualizado_at,
        a.nota,
        a.marcado_por_usuario_id,

        p.name,
        p.price,
        p.priceOriginal,
        p.stock,
        p.status,
        p.barcode,
        p.updated_at,
        p.categoria,
        p.subcategoria,
        (p.image IS NOT NULL AND LENGTH(p.image) > 0) AS has_image,

        u.email AS marcado_por_email,
        u.nombre AS marcado_por_nombre,
        u.apellido AS marcado_por_apellido
      FROM eco_producto_actualizacion a
      JOIN productos_test p ON p.id = a.producto_id
      LEFT JOIN eco_usuario u ON u.id = a.marcado_por_usuario_id
      WHERE a.estado = ?
      ORDER BY a.marcado_at DESC
      `,
      [estado]
    );

    return res.json({ ok: true, data: rows });
  } catch (err) {
    console.error("listar actualizacion error:", err);
    return res.status(500).json({ ok: false, error: "Error interno del servidor" });
  }
}

export async function confirmarActualizado(req, res) {
  try {
    const pool = req.app.locals.pool;

    const productoId = Number(req.params.productoId);
    if (!Number.isFinite(productoId) || productoId <= 0) {
      return res.status(400).json({ ok: false, error: "productoId inválido" });
    }

    const [r] = await pool.query(
      `
      UPDATE eco_producto_actualizacion
      SET estado = 'actualizado',
          actualizado_at = CURRENT_TIMESTAMP
      WHERE producto_id = ?
      `,
      [productoId]
    );

    if (!r.affectedRows) {
      return res.status(404).json({ ok: false, error: "No estaba marcado para actualizar" });
    }

    return res.json({ ok: true, data: { productoId, estado: "actualizado" } });
  } catch (err) {
    console.error("confirmarActualizado error:", err);
    return res.status(500).json({ ok: false, error: "Error interno del servidor" });
  }
}
