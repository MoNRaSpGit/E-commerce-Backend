const ESTADOS = new Set(["pendiente", "en_proceso", "listo", "cancelado"]);

function normalizeItems(items) {
  // items: [{ productoId, cantidad }]
  const clean = [];
  for (const it of items) {
    const productoId = Number(it?.productoId);
    const cantidad = Number(it?.cantidad);
    if (!productoId || cantidad <= 0 || !Number.isFinite(cantidad)) continue;
    clean.push({ productoId, cantidad: Math.floor(cantidad) });
  }
  return clean;
}

export async function crearPedidoDesdeItems(pool, { usuarioId, items, entrega, meta }) {
  const uid = Number(usuarioId);
  if (!uid) return { ok: false, error: "Usuario inválido" };

  const cleanItems = normalizeItems(items);
  if (cleanItems.length === 0) return { ok: false, error: "Items inválidos" };

  // Traer productos reales desde DB (NO confiar en precios del front)
  const ids = [...new Set(cleanItems.map((x) => x.productoId))];
  const placeholders = ids.map(() => "?").join(",");

  const [rows] = await pool.query(
    `SELECT id, name, price, status
     FROM productos_test
     WHERE id IN (${placeholders})`,
    ids
  );

  const byId = new Map(rows.map((r) => [Number(r.id), r]));

  // Validar que existan y estén activos
  for (const it of cleanItems) {
    const p = byId.get(it.productoId);
    if (!p) return { ok: false, error: `Producto ${it.productoId} no existe` };
    if (p.status !== "activo") return { ok: false, error: `Producto ${it.productoId} no está activo` };
  }

  // Construir items finales con snapshot
  const finalItems = cleanItems.map((it) => {
    const p = byId.get(it.productoId);
    const precio = Number(p.price) || 0;
    const subtotal = precio * it.cantidad;

    return {
      producto_id: it.productoId,
      nombre_snapshot: p.name,
      precio_unitario_snapshot: precio,
      cantidad: it.cantidad,
      subtotal,
    };
  });

  const total = finalItems.reduce((acc, x) => acc + x.subtotal, 0);

  // Transacción
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [insPedido] = await conn.query(
      `INSERT INTO eco_pedido
        (usuario_id, estado, total, moneda,
         nombre_receptor, telefono_receptor, direccion_entrega, notas,
         creado_por_ip, creado_por_user_agent)
       VALUES (?, 'pendiente', ?, 'UYU', ?, ?, ?, ?, ?, ?)`,
      [
        uid,
        total,
        entrega?.nombre_receptor || null,
        entrega?.telefono_receptor || null,
        entrega?.direccion_entrega || null,
        entrega?.notas || null,
        meta?.ip || null,
        meta?.userAgent || null,
      ]
    );

    const pedidoId = insPedido.insertId;

    // Bulk insert items
    const values = finalItems.map((x) => [
      pedidoId,
      x.producto_id,
      x.nombre_snapshot,
      x.precio_unitario_snapshot,
      x.cantidad,
      x.subtotal,
    ]);

    await conn.query(
      `INSERT INTO eco_pedido_item
        (pedido_id, producto_id, nombre_snapshot, precio_unitario_snapshot, cantidad, subtotal)
       VALUES ?`,
      [values]
    );

    await conn.commit();

    return {
      ok: true,
      pedido: {
        id: Number(pedidoId),
        estado: "pendiente",
        total,
        moneda: "UYU",
      },
    };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

export async function obtenerPedidosDeUsuario(pool, usuarioId) {
  const uid = Number(usuarioId);
  const [rows] = await pool.query(
    `SELECT id, estado, total, moneda, created_at, updated_at
     FROM eco_pedido
     WHERE usuario_id = ?
     ORDER BY created_at DESC`,
    [uid]
  );
  return rows;
}

export async function obtenerPedidos(pool, { estado }) {
  if (estado && !ESTADOS.has(estado)) return [];

  const params = [];
  let where = "";
  if (estado) {
    where = "WHERE p.estado = ?";
    params.push(estado);
  }

  const [rows] = await pool.query(
    `SELECT
        p.id, p.usuario_id, u.email AS usuario_email,
        p.estado, p.total, p.moneda, p.created_at, p.updated_at
     FROM eco_pedido p
     JOIN eco_usuario u ON u.id = p.usuario_id
     ${where}
     ORDER BY p.created_at DESC
     LIMIT 200`,
    params
  );

  return rows;
}

export async function actualizarEstadoPedido(pool, { pedidoId, estado }) {
  const id = Number(pedidoId);
  if (!id) return { ok: false, error: "Pedido inválido" };
  if (!ESTADOS.has(estado)) return { ok: false, error: "Estado inválido" };

  const [r] = await pool.query(
    `UPDATE eco_pedido SET estado = ?, updated_at = NOW() WHERE id = ?`,
    [estado, id]
  );

  if (!r.affectedRows) return { ok: false, error: "Pedido no encontrado" };

  return { ok: true, pedidoId: id, estado };
}

export async function obtenerDetallePedido(pool, pedidoId) {
  const id = Number(pedidoId);
  if (!id) return null;

  const [pedRows] = await pool.query(
    `SELECT
        p.id, p.usuario_id, u.email AS usuario_email,
        p.estado, p.total, p.moneda, p.created_at, p.updated_at
     FROM eco_pedido p
     JOIN eco_usuario u ON u.id = p.usuario_id
     WHERE p.id = ?
     LIMIT 1`,
    [id]
  );

  const pedido = pedRows?.[0];
  if (!pedido) return null;

  const [items] = await pool.query(
    `SELECT
        id, pedido_id, producto_id,
        nombre_snapshot, precio_unitario_snapshot, cantidad, subtotal
     FROM eco_pedido_item
     WHERE pedido_id = ?
     ORDER BY id ASC`,
    [id]
  );

  return { ...pedido, items };
}

