import { Router } from "express";
import {
  obtenerProductos,
  obtenerProductosAdmin,
  actualizarProducto,
  ajustarStockProducto,
  obtenerProductoImagen,
  actualizarCategoriaMasiva,
  obtenerProductoPorBarcode,
  crearProductoPorBarcode,
  crearProductoRapido,
  eliminarProducto,
  actualizarProductoImagen,
} from "../controllers/productos.controller.js";

import { requireAuth, requireRole } from "../middlewares/auth.js";
import multer from "multer";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 }, // 2MB
});


const router = Router();

/**
 * Público / cliente
 * Lista simple (la que ya usás en /productos)
 */
router.get("/", obtenerProductos);

/**
 * Operario / Admin
 * Alta rápida cuando el barcode no existe
 */
router.post(
  "/",
  requireAuth,
  requireRole("admin", "operario"),
  crearProductoRapido
);


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
 * Operario / Admin
 * Crear producto por barcode (si no existe)
 */
router.post(
  "/barcode/:barcode",
  requireAuth,
  requireRole("admin", "operario"),
  crearProductoPorBarcode
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


/**
 * Admin / Operario
 * Eliminar producto
 */
router.delete(
  "/:id",
  requireAuth,
  requireRole("admin", "operario"),
  eliminarProducto
);


/**
 * Admin / Operario
 * Subir imagen producto (multipart/form-data)
 */
router.put(
  "/:id/image",
  requireAuth,
  requireRole("admin", "operario"),
  upload.single("image"),
  actualizarProductoImagen
);


router.get("/:id/image", obtenerProductoImagen);





export default router;
