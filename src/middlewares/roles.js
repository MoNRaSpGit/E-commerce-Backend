export function roles(...allowed) {
  const allowedSet = new Set(allowed.map((x) => String(x || "").toLowerCase()));

  return (req, res, next) => {
    // asumimos que auth deja el user en req.user
    const rol = String(req.user?.rol || req.user?.role || "").toLowerCase();

    if (!rol) {
      return res.status(401).json({ ok: false, error: "No autorizado" });
    }

    if (!allowedSet.has(rol)) {
      return res.status(403).json({ ok: false, error: "Prohibido" });
    }

    next();
  };
}