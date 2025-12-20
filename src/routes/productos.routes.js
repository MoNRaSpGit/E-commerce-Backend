import { Router } from "express";
import { obtenerProductos } from "../controllers/productos.controller.js";

const router = Router();

router.get("/", obtenerProductos);

export default router;
