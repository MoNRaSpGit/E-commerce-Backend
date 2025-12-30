import { Router } from "express";
import {
  crearPedido,
  misPedidos,
  listarPedidos,
  cambiarEstadoPedido,
  detallePedido,
  archivarPedido,
} from "../controllers/pedidos.controller.js";

import { streamPedidos ,streamMisPedidos} from "../controllers/pedidos.stream.controller.js";



import { requireAuth, requireRole } from "../middlewares/auth.js";
import { requireAuthSse } from "../middlewares/authSse.js";

const router = Router();

// Cliente: crear pedido + ver sus pedidos
router.post("/", requireAuth, requireRole("cliente", "admin"), crearPedido);
// ✅ SSE para MisPedidos (cliente)
router.get(
  "/mios/stream",
  requireAuthSse,
  requireRole("cliente", "admin"),
  streamMisPedidos
);

router.get("/mios", requireAuth, requireRole("cliente", "admin"), misPedidos);

// ✅ SSE stream (ANTES de /:id para que no lo pise)
router.get(
  "/stream",
  requireAuthSse,
  requireRole("operario", "admin"),
  streamPedidos
);

// Operario/Admin: ver todos + cambiar estado + detalle
router.get("/", requireAuth, requireRole("operario", "admin"), listarPedidos);
router.patch("/:id/estado", requireAuth, requireRole("operario", "admin"), cambiarEstadoPedido);
router.get("/:id", requireAuth, requireRole("operario", "admin"), detallePedido);
router.patch("/:id/archivar", requireAuth, requireRole("operario", "admin"), archivarPedido);


export default router;
