import { Router } from "express";
import {
  crearPedido,
  misPedidos,
  listarPedidos,
  cambiarEstadoPedido,
} from "../controllers/pedidos.controller.js";
import { requireAuth, requireRole } from "../middlewares/auth.js";

const router = Router();

// Cliente: crear pedido + ver sus pedidos
router.post("/", requireAuth, requireRole("cliente", "admin"), crearPedido);
router.get("/mios", requireAuth, requireRole("cliente", "admin"), misPedidos);

// Operario/Admin: ver todos + cambiar estado
router.get("/", requireAuth, requireRole("operario", "admin"), listarPedidos);
router.patch("/:id/estado", requireAuth, requireRole("operario", "admin"), cambiarEstadoPedido);

export default router;
