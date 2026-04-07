import { emitCaja } from "../realtime/cajaHub.js";
import { performance } from "node:perf_hooks";

async function obtenerCajaActivaDesdeExecutor(executor, { forUpdate = false } = {}) {
  const lockClause = forUpdate ? " FOR UPDATE" : "";
  const [rows] = await executor.query(
    `SELECT
      c.id,
      c.estado,
      c.monto_inicial,
      c.monto_actual,
      c.abierta_por_usuario_id,
      c.cerrada_por_usuario_id,
      c.fecha_apertura,
      c.fecha_cierre,
      c.created_at,
      c.updated_at
     FROM eco_caja c
     WHERE c.estado = 'abierta'
     ORDER BY c.fecha_apertura DESC, c.id DESC
     LIMIT 1${lockClause}`
  );

  return rows?.[0] || null;
}

function normalizePositiveInt(value, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return Math.floor(parsed);
}

export async function obtenerCajaActiva(pool) {
  return obtenerCajaActivaDesdeExecutor(pool);
}

export async function listarMovimientosCajaActiva(pool) {
  const caja = await obtenerCajaActiva(pool);
  if (!caja) return { caja: null, movimientos: [] };

  const [rows] = await pool.query(
    `SELECT
      m.id,
      m.caja_id,
      m.tipo,
      m.monto,
      m.descripcion,
      m.usuario_id,
      m.pedido_id,
      m.scan_session_id,
      m.created_at,
      u.nombre,
      u.apellido,
      u.email
     FROM eco_caja_movimiento m
     JOIN eco_usuario u ON u.id = m.usuario_id
     WHERE m.caja_id = ?
     ORDER BY m.created_at DESC, m.id DESC`,
    [caja.id]
  );

  return { caja, movimientos: rows };
}

export async function getCajaDashboard(
  pool,
  { rankingLimit = 10, movimientosLimit = 20, sesionesLimit = 10 } = {}
) {
  const safeRankingLimit = normalizePositiveInt(rankingLimit, 10);
  const safeMovimientosLimit = normalizePositiveInt(movimientosLimit, 20);
  const safeSesionesLimit = normalizePositiveInt(sesionesLimit, 10);
  const caja = await obtenerCajaActiva(pool);

  const [ranking, sesionesActivas, sesionesRecientes, movimientos] = await Promise.all([
    pool.query(
      `SELECT
        r.producto_id,
        r.cantidad_total AS total_vendido,
        p.name,
        p.image,
        p.price,
        r.updated_at
       FROM eco_ranking_producto_dia r
       JOIN productos_test p ON p.id = r.producto_id
       WHERE r.fecha = CURDATE()
       ORDER BY r.cantidad_total DESC, r.producto_id ASC
       LIMIT ?`,
      [safeRankingLimit]
    ),
    pool.query(
      `SELECT
        s.id,
        s.operario_id,
        CONCAT_WS(' ', u.nombre, u.apellido) AS operario_nombre,
        u.email AS operario_email,
        s.total_items,
        s.total_unidades,
        s.subtotal,
        s.started_at,
        s.updated_at
       FROM eco_scan_session s
       JOIN eco_usuario u ON u.id = s.operario_id
       WHERE s.estado = 'activa'
       ORDER BY s.updated_at DESC, s.id DESC`
    ),
    pool.query(
      `SELECT
        s.id,
        s.operario_id,
        CONCAT_WS(' ', u.nombre, u.apellido) AS operario_nombre,
        u.email AS operario_email,
        s.total_items,
        s.total_unidades,
        s.subtotal,
        s.started_at,
        s.updated_at,
        s.closed_at
       FROM eco_scan_session s
       JOIN eco_usuario u ON u.id = s.operario_id
       WHERE s.estado = 'cerrada'
       ORDER BY s.closed_at DESC, s.id DESC
       LIMIT ?`,
      [safeSesionesLimit]
    ),
    caja
      ? pool.query(
          `SELECT
            m.id,
            m.caja_id,
            m.tipo,
            m.monto,
            m.descripcion,
            m.usuario_id,
            m.pedido_id,
            m.scan_session_id,
            m.created_at,
            u.nombre,
            u.apellido,
            u.email
           FROM eco_caja_movimiento m
           JOIN eco_usuario u ON u.id = m.usuario_id
           WHERE m.caja_id = ?
           ORDER BY m.created_at DESC, m.id DESC
           LIMIT ?`,
          [caja.id, safeMovimientosLimit]
        )
      : Promise.resolve([[]]),
  ]);

  return {
    generated_at: new Date().toISOString(),
    caja: {
      activa: caja,
      movimientos: movimientos[0] || [],
    },
    ranking: {
      fecha: new Date().toISOString().slice(0, 10),
      items: ranking[0] || [],
    },
    scanlive: {
      sesiones_activas: sesionesActivas[0] || [],
      sesiones_recientes: sesionesRecientes[0] || [],
    },
  };
}

export async function abrirCaja(pool, { montoInicial, usuarioId }) {
  const monto = Number(montoInicial);
  const uid = Number(usuarioId);

  if (!Number.isFinite(monto) || monto < 0) {
    return { ok: false, error: "Monto inicial inválido" };
  }

  if (!uid) {
    return { ok: false, error: "Usuario inválido" };
  }

  const existente = await obtenerCajaActiva(pool);
  if (existente) {
    return { ok: false, error: "Ya hay una caja abierta" };
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [insCaja] = await conn.query(
      `INSERT INTO eco_caja
        (estado, monto_inicial, monto_actual, abierta_por_usuario_id, fecha_apertura)
       VALUES ('abierta', ?, ?, ?, NOW())`,
      [monto, monto, uid]
    );

    const cajaId = Number(insCaja.insertId);

    await conn.query(
      `INSERT INTO eco_caja_movimiento
        (caja_id, tipo, monto, descripcion, usuario_id, created_at)
       VALUES (?, 'apertura', ?, ?, ?, NOW())`,
      [cajaId, monto, "Apertura de caja", uid]
    );

    await conn.commit();

    emitCaja("caja_updated", {
      type: "apertura",
      cajaId,
      monto_actual: monto,
      at: new Date().toISOString(),
    });

    return {
      ok: true,
      caja: {
        id: cajaId,
        estado: "abierta",
        monto_inicial: monto,
        monto_actual: monto,
      },
    };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

export async function registrarPagoCajaActiva(pool, { monto, descripcion, usuarioId }) {
  const value = Number(monto);
  const uid = Number(usuarioId);
  const desc = String(descripcion || "").trim();

  if (!Number.isFinite(value) || value <= 0) {
    return { ok: false, error: "Monto inválido" };
  }

  if (!desc) {
    return { ok: false, error: "Descripción requerida" };
  }

  if (!uid) {
    return { ok: false, error: "Usuario inválido" };
  }

  const caja = await obtenerCajaActiva(pool);
  if (!caja) {
    return { ok: false, error: "No hay caja abierta" };
  }

  const nuevoMonto = Number(caja.monto_actual) - value;

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    await conn.query(
      `INSERT INTO eco_caja_movimiento
        (caja_id, tipo, monto, descripcion, usuario_id, created_at)
       VALUES (?, 'pago', ?, ?, ?, NOW())`,
      [caja.id, value, desc, uid]
    );

    await conn.query(
      `UPDATE eco_caja
       SET monto_actual = ?, updated_at = NOW()
       WHERE id = ?`,
      [nuevoMonto, caja.id]
    );

    await conn.commit();

    emitCaja("caja_updated", {
      type: "pago",
      cajaId: caja.id,
      monto_actual: nuevoMonto,
      at: new Date().toISOString(),
    });

    return {
      ok: true,
      cajaId: caja.id,
      monto_actual: nuevoMonto,
    };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

export async function registrarVentaEnCajaSiHayActiva(
  pool,
  { operarioId, scanSessionId = null, totalVenta, descripcion = null, onTiming = null }
) {
  const startedAt = performance.now();
  const timings = {};
  const mark = (label, from) => {
    timings[label] = Number((performance.now() - from).toFixed(2));
  };

  const uid = Number(operarioId);
  const sessionId = scanSessionId ? Number(scanSessionId) : null;
  const monto = Number(totalVenta);
  const desc =
    String(descripcion || "").trim() || "Venta desde escaneo";

  if (!uid) {
    return { ok: false, error: "Operario inválido" };
  }

  if (!Number.isFinite(monto) || monto <= 0) {
    return { ok: false, error: "Monto de venta inválido" };
  }

  const cajaLookupStartedAt = performance.now();
  const caja = await obtenerCajaActiva(pool);
  mark("buscar_caja_activa_ms", cajaLookupStartedAt);

  // Modo prueba: si no hay caja abierta, no frenamos nada.
  if (!caja) {
    timings.total_ms = Number((performance.now() - startedAt).toFixed(2));
    onTiming?.(timings);
    return {
      ok: true,
      skipped: true,
      reason: "SIN_CAJA_ACTIVA",
    };
  }

  const nuevoMonto = Number(caja.monto_actual) + monto;

  const conn = await pool.getConnection();
  try {
    const beginTxStartedAt = performance.now();
    await conn.beginTransaction();
    mark("begin_transaction_ms", beginTxStartedAt);

    const insertMovimientoStartedAt = performance.now();
    await conn.query(
      `INSERT INTO eco_caja_movimiento
        (caja_id, tipo, monto, descripcion, usuario_id, scan_session_id, created_at)
       VALUES (?, 'venta', ?, ?, ?, ?, NOW())`,
      [caja.id, monto, desc, uid, sessionId]
    );
    mark("insert_movimiento_ms", insertMovimientoStartedAt);

    const updateCajaStartedAt = performance.now();
    await conn.query(
      `UPDATE eco_caja
       SET monto_actual = ?, updated_at = NOW()
       WHERE id = ?`,
      [nuevoMonto, caja.id]
    );
    mark("update_caja_ms", updateCajaStartedAt);

    const commitStartedAt = performance.now();
    await conn.commit();
    mark("commit_ms", commitStartedAt);

    const emitStartedAt = performance.now();
    emitCaja("caja_updated", {
      type: "venta",
      cajaId: caja.id,
      monto_actual: nuevoMonto,
      scanSessionId: sessionId,
      at: new Date().toISOString(),
    });
    mark("emit_caja_ms", emitStartedAt);

    timings.total_ms = Number((performance.now() - startedAt).toFixed(2));
    onTiming?.(timings);

    return {
      ok: true,
      skipped: false,
      cajaId: caja.id,
      monto_actual: nuevoMonto,
    };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

export async function registrarVentaEnCajaActivaEnConexion(
  conn,
  { operarioId, scanSessionId = null, totalVenta, descripcion = null, onTiming = null }
) {
  const startedAt = performance.now();
  const timings = {};
  const mark = (label, from) => {
    timings[label] = Number((performance.now() - from).toFixed(2));
  };

  const uid = Number(operarioId);
  const sessionId = scanSessionId ? Number(scanSessionId) : null;
  const monto = Number(totalVenta);
  const desc = String(descripcion || "").trim() || "Venta desde escaneo";

  if (!uid) {
    return { ok: false, error: "Operario invÃ¡lido" };
  }

  if (!Number.isFinite(monto) || monto <= 0) {
    return { ok: false, error: "Monto de venta invÃ¡lido" };
  }

  const updateCajaStartedAt = performance.now();
  const [updateResult] = await conn.query(
    `UPDATE eco_caja
     SET monto_actual = monto_actual + ?,
         updated_at = NOW(),
         id = LAST_INSERT_ID(id)
     WHERE estado = 'abierta'
     ORDER BY fecha_apertura DESC, id DESC
     LIMIT 1`,
    [monto]
  );
  mark("update_caja_ms", updateCajaStartedAt);

  if (!updateResult.affectedRows) {
    timings.total_ms = Number((performance.now() - startedAt).toFixed(2));
    onTiming?.(timings);
    return {
      ok: true,
      skipped: true,
      reason: "SIN_CAJA_ACTIVA",
    };
  }

  const cajaId = Number(updateResult.insertId || 0) || null;

  const insertMovimientoStartedAt = performance.now();
  await conn.query(
    `INSERT INTO eco_caja_movimiento
      (caja_id, tipo, monto, descripcion, usuario_id, scan_session_id, created_at)
     VALUES (?, 'venta', ?, ?, ?, ?, NOW())`,
    [cajaId, monto, desc, uid, sessionId]
  );
  mark("insert_movimiento_ms", insertMovimientoStartedAt);

  timings.total_ms = Number((performance.now() - startedAt).toFixed(2));
  onTiming?.(timings);

  return {
    ok: true,
    skipped: false,
    cajaId,
    monto_actual: null,
  };
}

export async function cerrarCajaActiva(pool, { usuarioId }) {
  const uid = Number(usuarioId);
  if (!uid) {
    return { ok: false, error: "Usuario inválido" };
  }

  const caja = await obtenerCajaActiva(pool);
  if (!caja) {
    return { ok: false, error: "No hay caja abierta" };
  }

  const [result] = await pool.query(
    `UPDATE eco_caja
     SET estado = 'cerrada',
         cerrada_por_usuario_id = ?,
         fecha_cierre = NOW(),
         updated_at = NOW()
     WHERE id = ? AND estado = 'abierta'`,
    [uid, caja.id]
  );

  if (!result.affectedRows) {
    return { ok: false, error: "No se pudo cerrar la caja" };
  }

  emitCaja("caja_updated", {
    type: "cierre",
    cajaId: caja.id,
    estado: "cerrada",
    at: new Date().toISOString(),
  });

  return {
    ok: true,
    cajaId: caja.id,
    estado: "cerrada",
  };
}
