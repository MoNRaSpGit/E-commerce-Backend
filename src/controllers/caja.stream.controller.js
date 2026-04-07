import { addCajaClient, removeCajaClient } from "../realtime/cajaHub.js";

export function streamCaja(req, res) {
  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders?.();

  const userId = req.user?.id;
  if (!userId) {
    return res.status(401).json({ ok: false, error: "No autenticado (SSE)" });
  }

  res.write(`event: ping\ndata: "ok"\n\n`);
  res.write(`event: caja_connected\ndata: {"ok":true}\n\n`);

  addCajaClient(res);
  console.info("[caja.sse] client_connected", {
    userId,
  });

  const keepAlive = setInterval(() => {
    try {
      res.write(`event: ping\ndata: "keep"\n\n`);
    } catch {
      clearInterval(keepAlive);
      removeCajaClient(res);
      try {
        res.end();
      } catch {}
    }
  }, 25000);

  req.on("close", () => {
    clearInterval(keepAlive);
    removeCajaClient(res);
    console.info("[caja.sse] client_disconnected", {
      userId,
    });
    try {
      res.end();
    } catch {}
  });
}
