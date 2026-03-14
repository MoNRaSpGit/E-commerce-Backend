const adminClients = new Set(); // admins mirando caja en vivo

export function addScanLiveAdminClient(res) {
  adminClients.add(res);
}

export function removeScanLiveAdminClient(res) {
  adminClients.delete(res);
}

export function emitScanLive(event, payload) {
  const msg = `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;

  for (const res of adminClients) {
    try {
      res.write(msg);
    } catch {
      adminClients.delete(res);
    }
  }
}