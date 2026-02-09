import { Router } from "express";
import {
  obtenerProductos,
  obtenerProductosAdmin,
  actualizarProducto,
  ajustarStockProducto,
  obtenerProductoImagen,
  actualizarCategoriaMasiva,
   obtenerProductoPorBarcode,
} from "../controllers/productos.controller.js";

import { requireAuth, requireRole } from "../middlewares/auth.js";

const router = Router();

/**
 * Público / cliente
 * Lista simple (la que ya usás en /productos)
 */
router.get("/", obtenerProductos);

/**
 * Operario / Admin
 * Buscar producto por código de barras (exact match)
 */
router.get(
  "/barcode/:barcode",
  requireAuth,
  requireRole("admin", "operario"),
  obtenerProductoPorBarcode
);



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
 * Setear categoría masiva
 */
router.patch(
  "/categoria",
  requireAuth,
  requireRole("admin", "operario"),
  actualizarCategoriaMasiva
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

/**
 * Admin / Operario
 * Ajustar stock (delta + / -)
 */
router.patch(
  "/:id/stock",
  requireAuth,
  requireRole("admin", "operario"),
  ajustarStockProducto
);

router.get("/:id/image", obtenerProductoImagen);





export default router;
