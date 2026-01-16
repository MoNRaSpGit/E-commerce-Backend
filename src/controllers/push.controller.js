import {
  saveSubscription,
  deleteSubscriptionByEndpoint,
  getSubscriptionsByUser,
  sendPushToUser,
} from "../services/push.service.js";



export async function vapidPublicKey(req, res) {

  try {
    const publicKey = String(process.env.VAPID_PUBLIC_KEY || "").trim();

    // ✅ modo pro: si no está configurado, NO es error → simplemente “push deshabilitado”
    if (!publicKey) {
      return res.status(200).json({
        ok: true,
        data: { enabled: false, publicKey: null },
      });
    }

    return res.status(200).json({
      ok: true,
      data: { enabled: true, publicKey },
    });
  } catch (err) {
    console.error("Error getVapidPublicKey:", err);
    return res.status(500).json({ ok: false, error: "Error obteniendo VAPID key" });
  }
}


export async function subscribePush(req, res) {
  try {
    const pool = req.app.locals.pool;

    const result = await saveSubscription(pool, {
      usuarioId: req.user.id,
      subscription: req.body,
      userAgent: req.headers["user-agent"] || null,
    });

    if (!result.ok) return res.status(400).json(result);

    // debug útil: si el endpoint se reasignó desde otro user, lo marcamos
    if (result.reassignedFrom) {
      console.log(
        `[push] endpoint reasignado: ${result.reassignedFrom} -> ${req.user.id}`
      );
    }

    return res.json({ ok: true, reassignedFrom: result.reassignedFrom || null });
  } catch (err) {
    console.error("subscribePush error:", err);
    return res.status(500).json({ ok: false, error: "Error interno del servidor" });
  }
}

export async function myPushSubs(req, res) {
  try {
    const pool = req.app.locals.pool;
    const rows = await getSubscriptionsByUser(pool, req.user.id);
    return res.json({ ok: true, total: rows.length, data: rows });
  } catch (err) {
    console.error("myPushSubs error:", err);
    return res.status(500).json({ ok: false, error: "Error interno del servidor" });
  }
}

export async function unsubscribePush(req, res) {
  try {
    const pool = req.app.locals.pool;

    const endpoint = req.body?.endpoint;
    if (!endpoint) {
      return res.status(400).json({ ok: false, error: "endpoint requerido" });
    }

    const result = await deleteSubscriptionByEndpoint(pool, endpoint);
    return res.json({ ok: true, ...result });
  } catch (err) {
    console.error("unsubscribePush error:", err);
    return res.status(500).json({ ok: false, error: "Error interno del servidor" });
  }
}



export async function testPushMe(req, res) {
  try {
    const pool = req.app.locals.pool;

    const payload = {
      type: "test",
      title: "Push OK ✅",
      body: "Si ves esto, Web Push backend está funcionando.",
      at: new Date().toISOString(),
    };

    const result = await sendPushToUser(pool, req.user.id, payload);
    return res.json({ ok: true, ...result });
  } catch (err) {
    console.error("testPushMe error:", err);
    return res.status(500).json({ ok: false, error: "Error interno del servidor" });
  }
}
