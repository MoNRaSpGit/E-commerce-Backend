// backend/src/routes/analytics.routes.js

import { Router } from "express";
import { topProducts, summary } from "../controllers/analytics.controller.js";
import { requireAuth, requireRole } from "../middlewares/auth.js";

const router = Router();

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
