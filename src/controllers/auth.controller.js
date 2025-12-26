import { loginConPassword, logoutConRefresh, refreshAccessToken, registerConPassword, registerYLogin } from "../services/auth.service.js";



/**
 * POST /api/auth/login
 * Body: { email, password }
 */
export async function login(req, res) {
  try {
    const { email, password, nombre, apellido, telefono } = req.body || {};

    if (!email || !password) {
      return res.status(400).json({
        ok: false,
        error: "Email y password son obligatorios",
      });
    }

    const pool = req.app.locals.pool;

    const result = await loginConPassword(pool, {
      email,
      password,
      meta: {
        userAgent: req.headers["user-agent"] || null,
        ip:
          req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
          req.ip ||
          null,
      },
    });

    if (!result.ok) {
      return res.status(401).json(result);
    }

    return res.json({
      ok: true,
      user: result.user,
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
    });
  } catch (err) {
    console.error("Login error:", err);
    return res.status(500).json({
      ok: false,
      error: "Error interno del servidor",
    });
  }
}

/**
 * POST /api/auth/logout
 * Body: { refreshToken }
 */
export async function logout(req, res) {
  try {
    const { refreshToken } = req.body || {};

    if (!refreshToken) {
      return res.status(400).json({
        ok: false,
        error: "refreshToken requerido",
      });
    }

    const pool = req.app.locals.pool;

    const result = await logoutConRefresh(pool, refreshToken);

    return res.json({
      ok: true,
      revocadas: result.revocadas,
    });
  } catch (err) {
    console.error("Logout error:", err);
    return res.status(500).json({
      ok: false,
      error: "Error interno del servidor",
    });
  }
}

/**
 * GET /api/auth/me
 * Devuelve el usuario desde el access token (req.user)
 */
export async function me(req, res) {
  try {
    const pool = req.app.locals.pool;

    const [rows] = await pool.query(
      `SELECT id, email, rol, nombre, apellido
       FROM eco_usuario
       WHERE id = ?
       LIMIT 1`,
      [req.user.id]
    );

    const u = rows?.[0];
    if (!u) return res.status(404).json({ ok: false, error: "Usuario no encontrado" });

    return res.json({
      ok: true,
      user: {
        id: u.id,
        email: u.email,
        rol: u.rol,
        nombre: u.nombre || null,
        apellido: u.apellido || null,
      },
    });
  } catch (err) {
    console.error("Me error:", err);
    return res.status(500).json({ ok: false, error: "Error interno del servidor" });
  }
}


/**
 * POST /api/auth/refresh
 * Body: { refreshToken }
 */
export async function refresh(req, res) {
  try {
    const { refreshToken } = req.body || {};
    if (!refreshToken) {
      return res.status(400).json({ ok: false, error: "refreshToken requerido" });
    }

    const pool = req.app.locals.pool;
    const result = await refreshAccessToken(pool, refreshToken);

    if (!result.ok) return res.status(401).json(result);

    return res.json({
      ok: true,
      accessToken: result.accessToken,
      user: result.user,
    });
  } catch (err) {
    console.error("Refresh error:", err);
    return res.status(500).json({ ok: false, error: "Error interno del servidor" });
  }
}

/**
 * POST /api/auth/register
 * Body: { email, password }
 */
export async function register(req, res) {
  try {
    const { email, password, nombre, apellido, telefono } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ ok: false, error: "Email y password son obligatorios" });
    }

    const pool = req.app.locals.pool;

    const result = await registerYLogin(pool, {
      email,
      password,
      nombre,
      apellido,
      telefono,
      meta: {
        userAgent: req.headers["user-agent"] || null,
        ip:
          req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
          req.ip ||
          null,
      },
    });

    if (!result.ok) return res.status(400).json(result);

    return res.status(201).json({
      ok: true,
      user: result.user,
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
    });
  } catch (err) {
    console.error("Register error:", err);
    return res.status(500).json({ ok: false, error: "Error interno del servidor" });
  }
}


