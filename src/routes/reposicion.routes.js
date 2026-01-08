// src/routes/reposicion.routes.js
import { Router } from "express";
import { requireAuth, requireRole } from "../middlewares/auth.js";
import { listarReposicion } from "../controllers/reposicion.controller.js";

const router = Router();

// GET /api/reposicion  (solo operario y admin)
router.get("/", requireAuth, requireRole("operario", "admin"), listarReposicion);

export default router;
