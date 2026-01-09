// backend/src/realtime/stockHub.js
const clients = new Set(); // clientes logueados conectados al stream de stock

export function addStockClient(res) {
  clients.add(res);
}

export function removeStockClient(res) {
  clients.delete(res);
}

export function emitStock(event, payload) {
  const msg = `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;
  for (const res of clients) {
    try {
      res.write(msg);
    } catch {
      clients.delete(res);
    }
  }
}
