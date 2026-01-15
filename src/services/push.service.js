import webpush from "web-push";

/**
 * Inicializa web-push con VAPID.
 * OJO: variables deben existir en Render:
 * VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT
 */
function ensureVapidConfigured() {
  const subject = process.env.VAPID_SUBJECT;
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;

  if (!subject || !publicKey || !privateKey) {
    throw new Error(
      "Faltan variables VAPID (VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY)"
    );
  }

  webpush.setVapidDetails(subject, publicKey, privateKey);
}

export function getVapidPublicKey() {
  const pk = process.env.VAPID_PUBLIC_KEY;
  if (!pk) throw new Error("Falta VAPID_PUBLIC_KEY");
  return pk;
}

export async function saveSubscription(pool, { usuarioId, subscription, userAgent }) {
  const endpoint = subscription?.endpoint;
  const p256dh = subscription?.keys?.p256dh;
  const auth = subscription?.keys?.auth;

  if (!endpoint || !p256dh || !auth) {
    return { ok: false, error: "Subscription inválida (endpoint/keys requeridos)" };
  }

  const uid = Number(usuarioId);
  if (!uid) return { ok: false, error: "Usuario inválido" };

    // (debug) si el endpoint ya existía para otro usuario, lo registramos
  let reassignedFrom = null;
  const [prev] = await pool.query(
    `SELECT usuario_id FROM eco_push_subscription WHERE endpoint = ? LIMIT 1`,
    [endpoint]
  );
  const prevUid = prev?.[0]?.usuario_id ? Number(prev[0].usuario_id) : null;
  if (prevUid && prevUid !== uid) reassignedFrom = prevUid;

  // UPSERT por endpoint (uq_push_endpoint)
 await pool.query(
  `
  INSERT INTO eco_push_subscription (usuario_id, endpoint, p256dh, auth, user_agent)
  VALUES (?, ?, ?, ?, ?)
  ON DUPLICATE KEY UPDATE
    usuario_id = VALUES(usuario_id),
    p256dh = VALUES(p256dh),
    auth = VALUES(auth),
    user_agent = VALUES(user_agent),
    updated_at = CURRENT_TIMESTAMP
  `,
  [uid, endpoint, p256dh, auth, userAgent || null]
);

// ✅ cleanup pro: dejar 1 sola suscripción por “dispositivo” (user_agent) para este usuario
// evita acumulación de endpoints en la misma PC
if (userAgent) {
  await pool.query(
    `DELETE FROM eco_push_subscription
     WHERE usuario_id = ?
       AND user_agent = ?
       AND endpoint <> ?`,
    [uid, userAgent, endpoint]
  );
}

return { ok: true, reassignedFrom };

}

export async function deleteSubscriptionByEndpoint(pool, endpoint) {
  if (!endpoint) return { ok: true, deleted: 0 };
  const [r] = await pool.query(`DELETE FROM eco_push_subscription WHERE endpoint = ?`, [endpoint]);
  return { ok: true, deleted: Number(r?.affectedRows || 0) };
}


export async function getSubscriptionsByUser(pool, usuarioId) {
  const uid = Number(usuarioId);
  if (!uid) return [];

  const [rows] = await pool.query(
    `SELECT id, usuario_id, endpoint, user_agent, created_at, updated_at
     FROM eco_push_subscription
     WHERE usuario_id = ?
     ORDER BY updated_at DESC, created_at DESC`,
    [uid]
  );

  return rows;
}


export async function sendPushToUser(pool, usuarioId, payload) {
  ensureVapidConfigured();

  const uid = Number(usuarioId);
  if (!uid) return { ok: false, error: "Usuario inválido" };

  const [rows] = await pool.query(
    `SELECT endpoint, p256dh, auth FROM eco_push_subscription WHERE usuario_id = ?`,
    [uid]
  );

  const data = JSON.stringify(payload ?? {});

  let sent = 0;
  let removed = 0;

  for (const r of rows) {
    const subscription = {
      endpoint: r.endpoint,
      keys: { p256dh: r.p256dh, auth: r.auth },
    };

    try {
      await webpush.sendNotification(subscription, data);
      sent++;
    } catch (err) {
      const status = err?.statusCode || err?.status;
      // 410/404 => subscripción muerta, la limpiamos
      if (status === 410 || status === 404) {
        await deleteSubscriptionByEndpoint(pool, r.endpoint);
        removed++;
      } else {
        // otros errores: los dejamos logueados (pero no rompemos)
        console.error("sendNotification error:", status, err?.message || err);
      }
    }
  }

  return { ok: true, sent, removed, total: rows.length };
}

export async function sendPushToRoles(pool, roles = [], payload) {
  ensureVapidConfigured();

  if (!Array.isArray(roles) || roles.length === 0) {
    return { ok: true, sent: 0, removed: 0, total: 0 };
  }

  // 1) buscar subscripciones de usuarios con esos roles
  const placeholders = roles.map(() => "?").join(",");

  const [rows] = await pool.query(
    `
    SELECT s.endpoint, s.p256dh, s.auth
    FROM eco_push_subscription s
    JOIN eco_usuario u ON u.id = s.usuario_id
    WHERE u.rol IN (${placeholders}) AND u.activo = 1
    `,
    roles
  );

  const data = JSON.stringify(payload ?? {});

  let sent = 0;
  let removed = 0;

  for (const r of rows) {
    const subscription = {
      endpoint: r.endpoint,
      keys: { p256dh: r.p256dh, auth: r.auth },
    };

    try {
      await webpush.sendNotification(subscription, data);
      sent++;
    } catch (err) {
      const status = err?.statusCode || err?.status;

      if (status === 410 || status === 404) {
        await deleteSubscriptionByEndpoint(pool, r.endpoint);
        removed++;
      } else {
        console.error("sendNotification error:", status, err?.message || err);
      }
    }
  }

  return { ok: true, sent, removed, total: rows.length };
}

