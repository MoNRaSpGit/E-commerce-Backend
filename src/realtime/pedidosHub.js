// src/realtime/pedidosHub.js
const staffClients = new Set(); // operario/admin
const userClients = new Map();  // userId -> Set(res)

export function addStaffClient(res) {
  staffClients.add(res);
}

export function removeStaffClient(res) {
  staffClients.delete(res);
}

export function addUserClient(userId, res) {
  const uid = String(userId);
  if (!userClients.has(uid)) userClients.set(uid, new Set());
  userClients.get(uid).add(res);
}

export function removeUserClient(userId, res) {
  const uid = String(userId);
  const set = userClients.get(uid);
  if (!set) return;
  set.delete(res);
  if (set.size === 0) userClients.delete(uid);
}

// emite a operarios/admin (todos)
export function emitStaff(event, payload) {
  const msg = `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;
  for (const res of staffClients) {
    try { res.write(msg); } catch { staffClients.delete(res); }
  }
}

// emite a un usuario específico (cliente)
export function emitToUser(userId, event, payload) {
  const uid = String(userId);
  const set = userClients.get(uid);
  if (!set) return;

  const msg = `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;
  for (const res of set) {
    try { res.write(msg); } catch { set.delete(res); }
  }

  if (set.size === 0) userClients.delete(uid);
}
