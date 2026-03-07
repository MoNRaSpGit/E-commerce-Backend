export async function desclasificarProducto(req, res) {
  const pool = req.app.locals.pool;
  const productoId = Number(req.params.productoId);
  const motivo = String(req.body?.motivo || "").trim() || null;

  if (!Number.isFinite(productoId) || productoId <= 0) {
    return res.status(400).json({ ok: false, error: "productoId inválido" });
  }

  try {
    // 1) Traer producto actual (snapshot)
    const [rows] = await pool.query(
      `SELECT id, name, price, stock, image, barcode, status, categoria, subcategoria
       FROM productos_test
       WHERE id = ?
       LIMIT 1`,
      [productoId]
    );

    const p = rows?.[0];
    if (!p) {
      return res.status(404).json({ ok: false, error: "Producto no encontrado" });
    }

    // 2) Insertar snapshot en eco_desclasificados (tal cual está)
    await pool.query(
      `INSERT INTO eco_desclasificados
        (producto_id, name, price, stock, image, barcode, status, categoria, subcategoria, motivo, desclasificado_por)
       VALUES
        (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        p.id,
        p.name ?? null,
        p.price ?? null,
        p.stock ?? null,
        p.image ?? null,
        p.barcode ?? null,
        p.status ?? null,
        p.categoria ?? null,
        p.subcategoria ?? null,
        motivo,
        req.user?.id ?? null,
      ]
    );

    // 3) Marcar el producto como desclasificado (soft)
    //    (recomendación: además stock=0 para que no se compre)
    await pool.query(
      `UPDATE productos_test
       SET status = 'desclasificado', stock = 0
       WHERE id = ?`,
      [productoId]
    );

    return res.json({ ok: true });
  } catch (err) {
    console.error("desclasificarProducto error:", err);
    return res.status(500).json({ ok: false, error: "Error desclasificando" });
  }
}