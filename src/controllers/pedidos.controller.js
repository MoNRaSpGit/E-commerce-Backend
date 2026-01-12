import {
  crearPedidoDesdeItems,
  obtenerPedidosDeUsuario,
  obtenerPedidos,
  actualizarEstadoPedido,
  obtenerDetallePedido,
  archivarPedidoService,
} from "../services/pedidos.service.js";
//import { emitPedidoCreado, emitPedidoEstado } from "../realtime/pedidosHub.js";
import { emitStaff, emitToUser } from "../realtime/pedidosHub.js";
import { sendPushToRoles } from "../services/push.service.js";


export async function crearPedido(req, res) {
  try {
    const { items, entrega } = req.body || {};
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ ok: false, error: "Items requeridos" });
    }

    const pool = req.app.locals.pool;

    const result = await crearPedidoDesdeItems(pool, {
      usuarioId: req.user.id,
      items,
      entrega: entrega || null,
      meta: {
        userAgent: req.headers["user-agent"] || null,
        ip: req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.ip || null,
      },
    });

    if (!result.ok) return res.status(400).json(result);

    // a) avisar a staff (operario/admin)
    emitStaff("pedido_creado", {
      usuarioId: req.user.id,
      pedidoId: result.pedido.id,
      estado: result.pedido.estado,
      total: result.pedido.total,
      moneda: result.pedido.moneda,
      at: new Date().toISOString(),
    });
    
    // 🔔 PUSH a staff (operario/admin) - funciona aunque tengan la web cerrada
    sendPushToRoles(pool, ["operario", "admin"], {
      type: "pedido_nuevo_staff",
      title: "Nuevo pedido 📦",
      body: `Pedido #${result.pedido.id} - Total ${result.pedido.total} ${result.pedido.moneda}`,
      pedidoId: result.pedido.id,
      at: new Date().toISOString(),
    }).catch((e) => console.error("push staff error:", e));


    // b) avisar al cliente (para MisPedidos SSE)
    emitToUser(req.user.id, "pedido_creado", {
      pedidoId: result.pedido.id,
      estado: result.pedido.estado,
      total: result.pedido.total,
      moneda: result.pedido.moneda,
      at: new Date().toISOString(),
    });



    return res.status(201).json(result);
  } catch (err) {
    console.error("crearPedido error:", err);
    return res.status(500).json({ ok: false, error: "Error interno del servidor" });
  }
}

export async function misPedidos(req, res) {
  try {
    const pool = req.app.locals.pool;
    const result = await obtenerPedidosDeUsuario(pool, req.user.id);
    return res.json({ ok: true, data: result });
  } catch (err) {
    console.error("misPedidos error:", err);
    return res.status(500).json({ ok: false, error: "Error interno del servidor" });
  }
}

export async function listarPedidos(req, res) {
  try {
    const pool = req.app.locals.pool;
    const { estado } = req.query || {};
    const result = await obtenerPedidos(pool, { estado: estado || null });
    return res.json({ ok: true, data: result });
  } catch (err) {
    console.error("listarPedidos error:", err);
    return res.status(500).json({ ok: false, error: "Error interno del servidor" });
  }
}

export async function cambiarEstadoPedido(req, res) {
  try {
    const pool = req.app.locals.pool;
    const id = Number(req.params.id);
    const { estado } = req.body || {};

    if (!id || !estado) {
      return res.status(400).json({ ok: false, error: "id y estado requeridos" });
    }

    const result = await actualizarEstadoPedido(pool, { pedidoId: id, estado });

    // ⛔ si falló, NO emitimos SSE
    if (!result.ok) return res.status(400).json(result);

    // buscar el usuario dueño del pedido
    const [ownRows] = await pool.query(
      `SELECT usuario_id FROM eco_pedido WHERE id = ? LIMIT 1`,
      [id]
    );
    const usuarioId = ownRows?.[0]?.usuario_id;

    // 1) avisar a staff (siempre)
    emitStaff("pedido_estado", {
      pedidoId: id,
      estado,
      at: new Date().toISOString(),
    });

    // 2) avisar al dueño del pedido (cliente)
    if (usuarioId) {
      emitToUser(usuarioId, "pedido_estado", {
        pedidoId: id,
        estado,
        at: new Date().toISOString(),
      });
    }

    return res.json(result);
  } catch (err) {
    console.error("cambiarEstadoPedido error:", err);
    return res.status(500).json({
      ok: false,
      error: "Error interno del servidor",
    });
  }
}



export async function detallePedido(req, res) {
  try {
    const pool = req.app.locals.pool;
    const id = Number(req.params.id);

    const data = await obtenerDetallePedido(pool, id);
    if (!data) return res.status(404).json({ ok: false, error: "Pedido no encontrado" });

    // ✅ cliente: solo puede ver su propio pedido
    if (req.user?.rol === "cliente" && Number(data.usuario_id) !== Number(req.user.id)) {
      return res.status(403).json({ ok: false, error: "Sin permisos" });
    }

    return res.json({ ok: true, data });
  } catch (err) {
    console.error("detallePedido error:", err);
    return res.status(500).json({ ok: false, error: "Error interno del servidor" });
  }
}

export async function archivarPedido(req, res) {
  try {
    const pool = req.app.locals.pool;
    const id = Number(req.params.id);

    if (!id) return res.status(400).json({ ok: false, error: "Pedido inválido" });

    const result = await archivarPedidoService(pool, { pedidoId: id });

    if (!result.ok) return res.status(400).json(result);

    return res.json(result);
  } catch (err) {
    console.error("archivarPedido error:", err);
    return res.status(500).json({ ok: false, error: "Error interno del servidor" });
  }
}

