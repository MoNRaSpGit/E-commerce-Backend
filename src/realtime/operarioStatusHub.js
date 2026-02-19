// backend/src/realtime/operarioStatusHub.js
const clients = new Set(); // clientes conectados al stream de operario status

export function addOperarioStatusClient(res) {
  clients.add(res);
}

export function removeOperarioStatusClient(res) {
  clients.delete(res);
}

export function emitOperarioStatus(event, payload) {
  const msg = `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;
  for (const res of clients) {
    try {
      res.write(msg);
    } catch {
      clients.delete(res);
    }
  }
}
