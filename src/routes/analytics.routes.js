// backend/src/routes/analytics.routes.js

import { Router } from "express";
import {
  topProducts,
  summary,
  operarioStatusPublic,
  setOperarioStatus,
} from "../controllers/analytics.controller.js";

import { requireAuth, requireRole } from "../middlewares/auth.js";

const router = Router();


// ✅ Público (cliente): semáforo operario
router.get("/operario-status", operarioStatusPublic);

// ✅ Operario/Admin: setea activo/inactivo
router.patch(
  "/operario-status",
  requireAuth,
  requireRole("operario", "admin"),
  setOperarioStatus
);


/**
 * Operario / Admin
 * Analytics de ventas
 */

// Top productos (ranking)
router.get(
  "/top-products",
  requireAuth,
  requireRole("operario", "admin"),
  topProducts
);

// Resumen + comparación
router.get(
  "/summary",
  requireAuth,
  requireRole("operario", "admin"),
  summary
);

export default router;
