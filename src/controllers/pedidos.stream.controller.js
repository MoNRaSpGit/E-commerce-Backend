// src/controllers/pedidos.stream.controller.js
import {
  addStaffClient,
  removeStaffClient,
  addUserClient,
  removeUserClient,
} from "../realtime/pedidosHub.js";

// ✅ Stream para OPERARIO/ADMIN (panel)
export function streamPedidos(req, res) {
  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");

  // ping inicial
  res.write(`event: ping\ndata: "ok"\n\n`);

  addStaffClient(res);

  const keepAlive = setInterval(() => {
    try {
      res.write(`event: ping\ndata: "keep"\n\n`);
    } catch {}
  }, 25000);

  req.on("close", () => {
    clearInterval(keepAlive);
    removeStaffClient(res);
  });
}

// ✅ Stream para CLIENTE/ADMIN (mis pedidos)
export function streamMisPedidos(req, res) {
  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");

  // req.user viene del requireAuthSse
  const userId = req.user?.id;
  if (!userId) {
    return res.status(401).json({ ok: false, error: "No autenticado (SSE)" });
  }

  res.write(`event: ping\ndata: "ok"\n\n`);

  addUserClient(userId, res);

  const keepAlive = setInterval(() => {
    try {
      res.write(`event: ping\ndata: "keep"\n\n`);
    } catch {}
  }, 25000);

  req.on("close", () => {
    clearInterval(keepAlive);
    removeUserClient(userId, res);
  });
}
