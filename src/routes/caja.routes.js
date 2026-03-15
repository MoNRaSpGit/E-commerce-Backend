import { Router } from "express";
import { requireAuth, requireRole } from "../middlewares/auth.js";
import {
  getCajaActiva,
  getMovimientosCajaActiva,
  postAbrirCaja,
  postPagoCaja,
  postCerrarCaja,
} from "../controllers/caja.controller.js";

const router = Router();

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