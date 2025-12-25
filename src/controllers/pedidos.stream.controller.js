import { addClient, removeClient } from "../realtime/pedidosHub.js";

export function streamPedidos(req, res) {
  // headers SSE
  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");

  // primer mensaje para abrir el canal
  res.write(`event: ping\ndata: "ok"\n\n`);

  addClient(res);

  // keep-alive (importante en proxies / Render)
  const keepAlive = setInterval(() => {
    try {
      res.write(`event: ping\ndata: "keep"\n\n`);
    } catch {}
  }, 25000);

  req.on("close", () => {
    clearInterval(keepAlive);
    removeClient(res);
  });
}
