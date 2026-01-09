// backend/src/routes/stock.routes.js
import { Router } from "express";
import { streamStock } from "../controllers/stock.stream.controller.js";
import { requireAuthSse } from "../middlewares/authSse.js";
import { requireRole } from "../middlewares/auth.js";

const router = Router();

// SSE stock para clientes logueados (cliente/admin)
router.get(
  "/stream",
  requireAuthSse,
  requireRole("cliente", "admin"),
  streamStock
);

export default router;
