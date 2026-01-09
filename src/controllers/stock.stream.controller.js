// backend/src/controllers/stock.stream.controller.js
import { addStockClient, removeStockClient } from "../realtime/stockHub.js";

export function streamStock(req, res) {
  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders?.();

  // requireAuthSse ya setea req.user si token es válido
  const userId = req.user?.id;
  if (!userId) {
    return res.status(401).json({ ok: false, error: "No autenticado (SSE)" });
  }

  // ping inicial
  res.write(`event: ping\ndata: "ok"\n\n`);

  addStockClient(res);

  const keepAlive = setInterval(() => {
    try {
      res.write(`event: ping\ndata: "keep"\n\n`);
    } catch {
      clearInterval(keepAlive);
      removeStockClient(res);
      try { res.end(); } catch {}
    }
  }, 25000);

  req.on("close", () => {
    clearInterval(keepAlive);
    removeStockClient(res);
    try { res.end(); } catch {}
  });
}
