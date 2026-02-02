import { emitStock } from "../realtime/stockHub.js"; // arriba del archivo
import { emitStaff } from "../realtime/pedidosHub.js";


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


function perfNowMs() {
  return Number(process.hrtime.bigint() / 1000000n); // ms
}
function perfLog(tag, t0, extra = "") {
  const dt = perfNowMs() - t0;
  console.log(`[PERF] ${tag} ${dt}ms${extra ? " " + extra : ""}`);
  return perfNowMs();
}


export async function crearPedidoDesdeItems(pool, { usuarioId, items, entrega, meta }) {
  const PERF_ID = Math.random().toString(16).slice(2, 8);

  const uid = Number(usuarioId);
  if (!uid) return { ok: false, error: "Usuario inválido" };

  const cleanItems = normalizeItems(items);
  if (cleanItems.length === 0) return { ok: false, error: "Items inválidos" };

  // ✅ Agrupar cantidades por productoId (evita updates repetidos si el carrito trae duplicados)
  const aggMap = new Map();
  for (const it of cleanItems) {
    aggMap.set(it.productoId, (aggMap.get(it.productoId) || 0) + it.cantidad);
  }
  const aggItems = [...aggMap.entries()].map(([productoId, cantidad]) => ({
    productoId,
    cantidad,
  }));

  // Traer productos reales desde DB (NO confiar en precios del front)
  const ids = aggItems.map((x) => x.productoId);
  const placeholders = ids.map(() => "?").join(",");

  let tSelProductos = perfNowMs();
  const [rows] = await pool.query(
    `SELECT id, name, price, status, stock
      FROM productos_test
      WHERE id IN (${placeholders})`,
    ids
  );
  perfLog(`(${PERF_ID}) productos SELECT`, tSelProductos, `ids=${ids.length} items=${cleanItems.length}`);

  const byId = new Map(rows.map((r) => [Number(r.id), r]));
  const repoUpdates = new Set(); // productos que deben disparar reposicion_update

  // Validar que existan, estén activos y haya stock (sobre aggItems)
  for (const it of aggItems) {
    const p = byId.get(it.productoId);
    if (!p) return { ok: false, error: `Producto ${it.productoId} no existe` };
    if (p.status !== "activo") return { ok: false, error: `Producto ${it.productoId} no está activo` };

    const stock = Number(p.stock ?? 0);
    if (stock < it.cantidad) {
      return { ok: false, error: `Sin stock para "${p.name}" (disp: ${stock})` };
    }
  }

  // Construir items finales con snapshot (mantenemos líneas originales del carrito)
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
    let tBegin = perfNowMs();
    await conn.query("SET TRANSACTION ISOLATION LEVEL READ COMMITTED");
    await conn.beginTransaction();
    perfLog(`(${PERF_ID}) BEGIN`, tBegin);

    const tTxTotal = perfNowMs(); // total transacción desde acá

    const stockUpdates = [];

    // ✅ Descontar stock en 1 solo UPDATE (batch) usando JOIN con tabla derivada
    const subParts = aggItems.map(() => "SELECT ? AS id, ? AS qty").join(" UNION ALL ");
    const subParams = [];
    for (const it of aggItems) subParams.push(it.productoId, it.cantidad);

    let tUpd = perfNowMs();
    const [u] = await conn.query(
      `UPDATE productos_test p
       JOIN (${subParts}) x ON x.id = p.id
       SET p.stock = p.stock - x.qty
       WHERE p.stock >= x.qty`,
      subParams
    );
    perfLog(`(${PERF_ID}) UPDATE stock batch`, tUpd, `unique=${aggItems.length}`);

    if (u.affectedRows !== aggItems.length) {
      const first = aggItems[0];
      const p = byId.get(first?.productoId);
      throw new Error(`SIN_STOCK:${p?.name || first?.productoId || "producto"}`);
    }

    // ✅ Leer stocks resultantes en 1 solo SELECT
    const placeholders2 = ids.map(() => "?").join(",");
    let tSelStock = perfNowMs();
    const [stockRows] = await conn.query(
      `SELECT id, stock FROM productos_test WHERE id IN (${placeholders2})`,
      ids
    );
    perfLog(`(${PERF_ID}) SELECT stocks post-update`, tSelStock, `ids=${ids.length}`);

    const stockById = new Map(stockRows.map((r) => [Number(r.id), Number(r.stock ?? 0)]));

    // armar stockUpdates + detectar reposición
    const repoValues = [];
    for (const it of aggItems) {
      const stockResultante = stockById.get(it.productoId) ?? 0;
      stockUpdates.push({ productoId: it.productoId, stock: stockResultante });

      if (stockResultante <= 3) {
        const nivel = stockResultante === 0 ? "critico" : "bajo";
        repoValues.push([it.productoId, stockResultante, nivel]);
        repoUpdates.add(it.productoId);
      }
    }

    // ✅ Bulk insert reposición (solo si hubo)
    if (repoValues.length) {
      let tRepo = perfNowMs();
      await conn.query(
        `INSERT INTO eco_reposicion_alerta (producto_id, stock_en_evento, nivel)
         VALUES ?`,
        [repoValues]
      );
      perfLog(`(${PERF_ID}) INSERT reposicion bulk`, tRepo, `rows=${repoValues.length}`);
    }

    // INSERT pedido
    let tInsPedido = perfNowMs();
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
    perfLog(`(${PERF_ID}) insert pedido`, tInsPedido);

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

    let tInsItems = perfNowMs();
    await conn.query(
      `INSERT INTO eco_pedido_item
          (pedido_id, producto_id, nombre_snapshot, precio_unitario_snapshot, cantidad, subtotal)
       VALUES ?`,
      [values]
    );
    perfLog(`(${PERF_ID}) bulk insert items`, tInsItems, `count=${values.length}`);

    // COMMIT + totales
    let tCommit = perfNowMs();
    await conn.commit();
    perfLog(`(${PERF_ID}) COMMIT`, tCommit);
    perfLog(`(${PERF_ID}) TX TOTAL`, tTxTotal);

    // post-commit SSE
    for (const su of stockUpdates) emitStock("stock_update", su);
    for (const productoId of repoUpdates) emitStaff("reposicion_update", { productoId });

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

    const msg = String(err?.message || "");
    if (msg.startsWith("SIN_STOCK:")) {
      const name = msg.split("SIN_STOCK:")[1] || "producto";
      return { ok: false, error: `Sin stock para "${name}"` };
    }

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
      AND archivado = 0
      ORDER BY created_at DESC
`,
    [uid]
  );
  return rows;
}

export async function obtenerPedidos(pool, { estado }) {
  if (estado && !ESTADOS.has(estado)) return [];

  const params = [];
  let where = "WHERE p.archivado = 0";
  if (estado) {
    where += " AND p.estado = ?";
    params.push(estado);
  }


  const [rows] = await pool.query(
    `SELECT
    p.id,
    p.usuario_id,
    u.email AS usuario_email,
    u.nombre,
    u.apellido,
    TRIM(CONCAT(IFNULL(u.nombre,''), ' ', IFNULL(u.apellido,''))) AS usuario_nombre,
    p.estado,
    p.total,
    p.moneda,
    p.created_at,
    p.updated_at
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

  // 1) Leer estado actual
  const [rows] = await pool.query(
    `SELECT estado FROM eco_pedido WHERE id = ? LIMIT 1`,
    [id]
  );

  const actual = rows?.[0]?.estado;
  if (!actual) return { ok: false, error: "Pedido no encontrado" };

  // 2) Si no cambia, OK (idempotente)
  if (actual === estado) {
    return { ok: true, pedidoId: id, estado };
  }

  // 3) Validar transición
  const ALLOWED = {
    pendiente: new Set(["en_proceso", "cancelado"]),
    en_proceso: new Set(["listo", "cancelado"]),
    listo: new Set([]),
    cancelado: new Set([]),
  };

  const allowedNext = ALLOWED[actual] || new Set();
  if (!allowedNext.has(estado)) {
    return {
      ok: false,
      error: `Transición inválida: ${actual} → ${estado}`,
    };
  }

  // 4) Actualizar
  const [r] = await pool.query(
    `UPDATE eco_pedido
      SET estado = ?, updated_at = NOW()
      WHERE id = ?`,
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


export async function archivarPedidoService(pool, { pedidoId }) {
  const id = Number(pedidoId);
  if (!id) return { ok: false, error: "Pedido inválido" };

  // Solo se puede archivar si está listo o canceladowsada
  const [rows] = await pool.query(
    `SELECT estado, archivado FROM eco_pedido WHERE id = ? LIMIT 1`,
    [id]
  );

  const p = rows?.[0];
  if (!p) return { ok: false, error: "Pedido no encontrado" };
  if (Number(p.archivado) === 1) return { ok: true, pedidoId: id, archivado: true };

  if (p.estado !== "listo" && p.estado !== "cancelado") {
    return { ok: false, error: "Solo se puede archivar si está listo o cancelado" };
  }

  await pool.query(
    `UPDATE eco_pedido SET archivado = 1, updated_at = NOW() WHERE id = ?`,
    [id]
  );

  return { ok: true, pedidoId: id, archivado: true };
}


