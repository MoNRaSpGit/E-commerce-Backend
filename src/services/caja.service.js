export async function obtenerCajaActiva(pool) {
  const [rows] = await pool.query(
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
     LIMIT 1`
  );

  return rows?.[0] || null;
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
  { operarioId, scanSessionId = null, totalVenta, descripcion = null }
) {
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

  const caja = await obtenerCajaActiva(pool);

  // Modo prueba: si no hay caja abierta, no frenamos nada.
  if (!caja) {
    return {
      ok: true,
      skipped: true,
      reason: "SIN_CAJA_ACTIVA",
    };
  }

  const nuevoMonto = Number(caja.monto_actual) + monto;

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    await conn.query(
      `INSERT INTO eco_caja_movimiento
        (caja_id, tipo, monto, descripcion, usuario_id, scan_session_id, created_at)
       VALUES (?, 'venta', ?, ?, ?, ?, NOW())`,
      [caja.id, monto, desc, uid, sessionId]
    );

    await conn.query(
      `UPDATE eco_caja
       SET monto_actual = ?, updated_at = NOW()
       WHERE id = ?`,
      [nuevoMonto, caja.id]
    );

    await conn.commit();

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

  return {
    ok: true,
    cajaId: caja.id,
    estado: "cerrada",
  };
}