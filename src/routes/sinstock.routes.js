// backend/src/routes/sinstock.routes.js
import { Router } from "express";
import { requireAuth, requireRole } from "../middlewares/auth.js";
import { listarProductosSinStock } from "../controllers/sinstock.controller.js";

const router = Router();

router.get(
  "/",
  requireAuth,
  requireRole("admin", "operario"),
  listarProductosSinStock
);

export default router;