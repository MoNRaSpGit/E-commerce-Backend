import {
  obtenerCajaActiva,
  listarMovimientosCajaActiva,
  getCajaDashboard,
  abrirCaja,
  registrarPagoCajaActiva,
  cerrarCajaActiva,
} from "../services/caja.service.js";
import { performance } from "node:perf_hooks";

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

export async function getCajaDashboardView(req, res) {
  try {
    const pool = req.app.locals.pool;
    const { rankingLimit, movimientosLimit, sesionesLimit } = req.query;

    const data = await getCajaDashboard(pool, {
      rankingLimit,
      movimientosLimit,
      sesionesLimit,
    });

    return res.json({ ok: true, data });
  } catch (err) {
    console.error("getCajaDashboardView error:", err);
    return res.status(500).json({ ok: false, error: "Error interno del servidor" });
  }
}

export async function getCajaDbLatencyDiagnostics(req, res) {
  const pool = req.app.locals.pool;
  const runs = Math.max(1, Math.min(5, Number(req.query?.runs || 3)));
  const results = [];

  const measure = async (label, fn) => {
    const startedAt = performance.now();
    const value = await fn();
    return {
      label,
      ms: Number((performance.now() - startedAt).toFixed(2)),
      value,
    };
  };

  try {
    for (let i = 0; i < runs; i += 1) {
      const connStep = await measure("get_connection", () => pool.getConnection());
      const conn = connStep.value;
      let transactionOpen = false;

      try {
        const steps = [];
        steps.push({ label: connStep.label, ms: connStep.ms });

        const pingStep = await measure("select_1", async () => {
          const [[row]] = await conn.query("SELECT 1 AS ok");
          return row;
        });
        steps.push({ label: pingStep.label, ms: pingStep.ms });

        const beginStep = await measure("begin_transaction", () => conn.beginTransaction());
        transactionOpen = true;
        steps.push({ label: beginStep.label, ms: beginStep.ms });

        const txSelectStep = await measure("select_1_in_tx", async () => {
          const [[row]] = await conn.query("SELECT 1 AS ok_tx");
          return row;
        });
        steps.push({ label: txSelectStep.label, ms: txSelectStep.ms });

        const cajaActivaStep = await measure("select_caja_activa", async () => {
          const [[row]] = await conn.query(
            `SELECT id, estado, monto_actual
             FROM eco_caja
             WHERE estado = 'abierta'
             ORDER BY fecha_apertura DESC, id DESC
             LIMIT 1`
          );
          return row || null;
        });
        steps.push({ label: cajaActivaStep.label, ms: cajaActivaStep.ms });

        const rankingStep = await measure("select_ranking_hoy", async () => {
          const [rows] = await conn.query(
            `SELECT producto_id, cantidad_total
             FROM eco_ranking_producto_dia
             WHERE fecha = CURDATE()
             ORDER BY cantidad_total DESC, producto_id ASC
             LIMIT 5`
          );
          return rows.length;
        });
        steps.push({ label: rankingStep.label, ms: rankingStep.ms });

        const commitStep = await measure("commit", () => conn.commit());
        transactionOpen = false;
        steps.push({ label: commitStep.label, ms: commitStep.ms });

        results.push({
          run: i + 1,
          total_ms: Number(steps.reduce((acc, step) => acc + step.ms, 0).toFixed(2)),
          steps,
        });
      } catch (runErr) {
        if (transactionOpen) {
          await conn.rollback();
        }
        throw runErr;
      } finally {
        conn.release();
      }
    }

    return res.json({
      ok: true,
      data: {
        runs,
        results,
      },
    });
  } catch (err) {
    console.error("getCajaDbLatencyDiagnostics error:", err);
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
