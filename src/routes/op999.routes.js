// backend/src/routes/op999.routes.js
import { Router } from "express";
import { requireAuth, requireRole } from "../middlewares/auth.js";
import { op999Image, op999List, op999Update } from "../controllers/op999.controller.js";

const router = Router();

// Lista (protegida)
router.get(
  "/productos",
  requireAuth,
  requireRole("admin", "operario"),
  op999List
);

// Imagen binaria (público para <img>)
router.get("/productos/:id/image", op999Image);

// Update (protegido)
router.patch(
  "/productos/:id",
  requireAuth,
  requireRole("admin", "operario"),
  op999Update
);

export default router;
