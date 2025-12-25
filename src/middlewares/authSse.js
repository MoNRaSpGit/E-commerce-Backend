import jwt from "jsonwebtoken";

export function requireAuthSse(req, res, next) {
  const token = req.query?.token ? String(req.query.token) : null;

  if (!token) {
    return res.status(401).json({ ok: false, error: "No autenticado (SSE)" });
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_ACCESS_SECRET);

    req.user = {
      id: payload.sub,
      rol: payload.rol,
      email: payload.email,
    };

    return next();
  } catch {
    return res.status(401).json({ ok: false, error: "Token inválido o expirado (SSE)" });
  }
}
