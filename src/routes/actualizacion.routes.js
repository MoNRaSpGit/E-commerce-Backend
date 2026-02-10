import { Router } from "express";
import { requireAuth, requireRole } from "../middlewares/auth.js";
import {
  marcarProducto,
  listar,
  confirmarActualizado,
} from "../controllers/actualizacion.controller.js";

const router = Router();

// Solo staff (operario/admin)
router.use(requireAuth, requireRole("admin", "operario"));

// POST /api/actualizacion/marcar
router.post("/marcar", marcarProducto);

// GET /api/actualizacion?estado=pendiente|actualizado
router.get("/", listar);

// POST /api/actualizacion/:productoId/confirmar
router.post("/:productoId/confirmar", confirmarActualizado);

export default router;
