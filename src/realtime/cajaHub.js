const cajaClients = new Set();

export function addCajaClient(res) {
  cajaClients.add(res);
}

export function removeCajaClient(res) {
  cajaClients.delete(res);
}

export function emitCaja(event, payload) {
  const msg = `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;

  for (const res of cajaClients) {
    try {
      res.write(msg);
    } catch {
      cajaClients.delete(res);
    }
  }
}