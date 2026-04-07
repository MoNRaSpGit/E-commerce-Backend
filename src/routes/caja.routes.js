import { Router } from "express";
import { requireAuth, requireRole } from "../middlewares/auth.js";
import {
  getCajaDashboardView,
  getCajaDbLatencyDiagnostics,
  getCajaActiva,
  getMovimientosCajaActiva,
  postAbrirCaja,
  postPagoCaja,
  postCerrarCaja,
} from "../controllers/caja.controller.js";
import { requireAuthSse } from "../middlewares/authSse.js";
import { streamCaja } from "../controllers/caja.stream.controller.js";


const router = Router();


router.get(
  "/dashboard/stream",
  requireAuthSse,
  requireRole("admin", "operario"),
  streamCaja
);

router.get(
  "/dashboard",
  requireAuth,
  requireRole("admin", "operario"),
  getCajaDashboardView
);

router.get(
  "/diagnostics/db-latency",
  requireAuth,
  requireRole("admin"),
  getCajaDbLatencyDiagnostics
);

router.get(
  "/stream",
  requireAuthSse,
  requireRole("admin", "operario"),
  streamCaja
);

router.get(
  "/activa",
  requireAuth,
  requireRole("admin", "operario"),
  getCajaActiva
);

router.get(
  "/activa/movimientos",
  requireAuth,
  requireRole("admin", "operario"),
  getMovimientosCajaActiva
);

router.post(
  "/abrir",
  requireAuth,
  requireRole("admin"),
  postAbrirCaja
);

router.post(
  "/pago",
  requireAuth,
  requireRole("admin", "operario"),
  postPagoCaja
);

router.post(
  "/cerrar",
  requireAuth,
  requireRole("admin"),
  postCerrarCaja
);

export default router;
