import { Router } from "express";
import { preciosList, preciosUpdate } from "../controllers/precios.controller.js";
import { requireAuth, requireRole } from "../middlewares/auth.js";

const router = Router();

// ver + editar: operario y admin
router.get("/", requireAuth, requireRole("operario", "admin"), preciosList);
router.patch("/:id", requireAuth, requireRole("operario", "admin"), preciosUpdate);

export default router;