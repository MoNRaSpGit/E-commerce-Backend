import {
  addScanLiveAdminClient,
  removeScanLiveAdminClient,
} from "../realtime/scanLiveHub.js";

export function streamScanLive(req, res) {
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

  addScanLiveAdminClient(res);

  const keepAlive = setInterval(() => {
    try {
      res.write(`event: ping\ndata: "keep"\n\n`);
    } catch {
      clearInterval(keepAlive);
      removeScanLiveAdminClient(res);
      try {
        res.end();
      } catch {}
    }
  }, 25000);

  req.on("close", () => {
    clearInterval(keepAlive);
    removeScanLiveAdminClient(res);
    try {
      res.end();
    } catch {}
  });
}