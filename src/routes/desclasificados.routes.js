import { Router } from "express";
import { requireAuth, requireRole } from "../middlewares/auth.js";
import {
  listarDesclasificados,
  desclasificarProducto,
} from "../controllers/desclasificados.controller.js";

const router = Router();

router.get(
  "/",
  requireAuth,
  requireRole("admin"),
  listarDesclasificados
);

/**
 * Admin / Operario
 * Desclasificar un producto (snapshot + marcar status)
 * POST /api/desclasificados/:productoId
 * body opcional: { motivo?: string }
 */
router.post(
  "/:productoId",
  requireAuth,
  requireRole("admin", "operario"),
  desclasificarProducto
);

export default router;