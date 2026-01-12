import { getVapidPublicKey, saveSubscription, sendPushToUser } from "../services/push.service.js";

export async function vapidPublicKey(req, res) {
  try {
    return res.json({ ok: true, publicKey: getVapidPublicKey() });
  } catch (err) {
    console.error("vapidPublicKey error:", err);
    return res.status(500).json({ ok: false, error: "Error interno del servidor" });
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
    return res.json({ ok: true });
  } catch (err) {
    console.error("subscribePush error:", err);
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
