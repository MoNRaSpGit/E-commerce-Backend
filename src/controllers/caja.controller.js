import {
  obtenerCajaActiva,
  listarMovimientosCajaActiva,
  abrirCaja,
  registrarPagoCajaActiva,
  cerrarCajaActiva,
} from "../services/caja.service.js";

export async function getCajaActiva(req, res) {
  try {
    const pool = req.app.locals.pool;
    const caja = await obtenerCajaActiva(pool);
    return res.json({ ok: true, data: caja });
  } catch (err) {
    console.error("getCajaActiva error:", err);
    return res.status(500).json({ ok: false, error: "Error interno del servidor" });
  }
}

export async function getMovimientosCajaActiva(req, res) {
  try {
    const pool = req.app.locals.pool;
    const data = await listarMovimientosCajaActiva(pool);
    return res.json({ ok: true, data });
  } catch (err) {
    console.error("getMovimientosCajaActiva error:", err);
    return res.status(500).json({ ok: false, error: "Error interno del servidor" });
  }
}

export async function postAbrirCaja(req, res) {
  try {
    const pool = req.app.locals.pool;
    const { montoInicial } = req.body || {};

    const result = await abrirCaja(pool, {
      montoInicial,
      usuarioId: req.user.id,
    });

    if (!result.ok) {
      return res.status(400).json(result);
    }

    return res.status(201).json(result);
  } catch (err) {
    console.error("postAbrirCaja error:", err);
    return res.status(500).json({ ok: false, error: "Error interno del servidor" });
  }
}

export async function postPagoCaja(req, res) {
  try {
    const pool = req.app.locals.pool;
    const { monto, descripcion } = req.body || {};

    const result = await registrarPagoCajaActiva(pool, {
      monto,
      descripcion,
      usuarioId: req.user.id,
    });

    if (!result.ok) {
      return res.status(400).json(result);
    }

    return res.status(201).json(result);
  } catch (err) {
    console.error("postPagoCaja error:", err);
    return res.status(500).json({ ok: false, error: "Error interno del servidor" });
  }
}

export async function postCerrarCaja(req, res) {
  try {
    const pool = req.app.locals.pool;

    const result = await cerrarCajaActiva(pool, {
      usuarioId: req.user.id,
    });

    if (!result.ok) {
      return res.status(400).json(result);
    }

    return res.json(result);
  } catch (err) {
    console.error("postCerrarCaja error:", err);
    return res.status(500).json({ ok: false, error: "Error interno del servidor" });
  }
}