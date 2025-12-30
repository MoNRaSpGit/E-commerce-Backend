import { Router } from "express";
import {
  obtenerProductos,
  obtenerProductosAdmin,
  actualizarProducto,
} from "../controllers/productos.controller.js";

import { requireAuth, requireRole } from "../middlewares/auth.js";

const router = Router();

/**
 * Público / cliente
 * Lista simple (la que ya usás en /productos)
 */
router.get("/", obtenerProductos);

/**
 * Admin / Operario
 * Lista completa para gestión
 */
router.get(
  "/admin",
  requireAuth,
  requireRole("admin", "operario"),
  obtenerProductosAdmin
);

/**
 * Admin / Operario
 * Editar producto
 */
router.patch(
  "/:id",
  requireAuth,
  requireRole("admin", "operario"),
  actualizarProducto
);

export default router;
