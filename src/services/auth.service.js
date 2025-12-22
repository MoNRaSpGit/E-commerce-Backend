import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import crypto from "crypto";

function sha256(text) {
  return crypto.createHash("sha256").update(text).digest("hex");
}

/**
 * Login con email/password:
 * - valida usuario + bcrypt
 * - genera accessToken (corto) y refreshToken (largo)
 * - guarda sesión en eco_sesion con hash del refresh
 */
export async function loginConPassword(pool, { email, password, meta }) {
  const [rows] = await pool.query(
    `SELECT id, email, password_hash, rol, activo
     FROM eco_usuario
     WHERE email = ?
     LIMIT 1`,
    [email]
  );

  const user = rows[0];

  // Mensaje genérico para evitar enumeración de usuarios
  if (!user) return { ok: false, error: "Credenciales inválidas" };
  if (!user.activo) return { ok: false, error: "Usuario inactivo" };

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) return { ok: false, error: "Credenciales inválidas" };

  // Access token (corto)
// Access token (corto)
const accessToken = jwt.sign(
  {
    sub: String(user.id),
    rol: user.rol,
    email: user.email,
  },
  process.env.JWT_ACCESS_SECRET,
  { expiresIn: process.env.ACCESS_TOKEN_TTL || "15m" }
);


  // Refresh token (largo)
  const refreshDays = Number(process.env.REFRESH_TOKEN_TTL_DAYS || 7);
  const refreshToken = jwt.sign(
    { sub: String(user.id) },
    process.env.JWT_REFRESH_SECRET,
    { expiresIn: `${refreshDays}d` }
  );

  // Guardar sesión con hash del refresh token
  const refreshHash = sha256(refreshToken);
  const expiraAt = new Date(Date.now() + refreshDays * 24 * 60 * 60 * 1000);

  await pool.query(
    `INSERT INTO eco_sesion (usuario_id, refresh_token_hash, user_agent, ip, expira_at)
     VALUES (?, ?, ?, ?, ?)`,
    [
      user.id,
      refreshHash,
      meta?.userAgent || null,
      meta?.ip || null,
      expiraAt
    ]
  );

  // Actualizar last_login_at
  await pool.query(
    `UPDATE eco_usuario SET last_login_at = NOW() WHERE id = ?`,
    [user.id]
  );

  return {
    ok: true,
    accessToken,
    refreshToken,
    user: {
      id: user.id,
      email: user.email,
      rol: user.rol
    }
  };
}

/**
 * Logout:
 * - recibe refreshToken
 * - calcula su hash
 * - marca la sesión como revocada (revocado_at)
 */
export async function logoutConRefresh(pool, refreshToken) {
  const refreshHash = sha256(refreshToken);

  const [result] = await pool.query(
    `UPDATE eco_sesion
     SET revocado_at = NOW()
     WHERE refresh_token_hash = ? AND revocado_at IS NULL`,
    [refreshHash]
  );

  return { ok: true, revocadas: result.affectedRows || 0 };
}


export async function refreshAccessToken(pool, refreshToken) {
  // 1) verificar firma del refresh token
  let payload;
  try {
    payload = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
  } catch (err) {
    return { ok: false, error: "Refresh token inválido o expirado" };
  }

  const userId = payload.sub;
  const refreshHash = sha256(refreshToken);

  // 2) validar sesión en DB: existe, no revocada, no expirada
 const [rows] = await pool.query(
  `SELECT s.id, s.usuario_id, s.expira_at, s.revocado_at, u.rol, u.email, u.activo
   FROM eco_sesion s
   JOIN eco_usuario u ON u.id = s.usuario_id
   WHERE s.refresh_token_hash = ?
   LIMIT 1`,
  [refreshHash]
);


  const sesion = rows[0];
  if (!sesion) return { ok: false, error: "Sesión no encontrada" };
  if (String(sesion.usuario_id) !== String(userId)) {
    return { ok: false, error: "Sesión inválida" };
  }
  if (!sesion.activo) return { ok: false, error: "Usuario inactivo" };
  if (sesion.revocado_at) return { ok: false, error: "Sesión revocada" };
  if (new Date(sesion.expira_at).getTime() <= Date.now()) {
    return { ok: false, error: "Sesión expirada" };
  }

  // 3) emitir nuevo access token
 const accessToken = jwt.sign(
  {
    sub: String(sesion.usuario_id),
    rol: sesion.rol,
    email: sesion.email,
  },
  process.env.JWT_ACCESS_SECRET,
  { expiresIn: process.env.ACCESS_TOKEN_TTL || "15m" }
);


  return {
    ok: true,
    accessToken,
    user: { id: sesion.usuario_id, rol: sesion.rol, email: sesion.email },
  };
}


export async function registerConPassword(pool, { email, password }) {
  // Validaciones básicas
  const cleanEmail = String(email).trim().toLowerCase();
  if (!cleanEmail.includes("@")) return { ok: false, error: "Email inválido" };
  if (String(password).length < 4) return { ok: false, error: "Password muy corta" };

  // evitar duplicados
  const [exists] = await pool.query(
    `SELECT id FROM eco_usuario WHERE email = ? LIMIT 1`,
    [cleanEmail]
  );
  if (exists.length > 0) {
    return { ok: false, error: "Ese email ya está registrado" };
  }

  const password_hash = await bcrypt.hash(password, 10);

  // por defecto: cliente
  const [result] = await pool.query(
    `INSERT INTO eco_usuario (email, password_hash, rol, activo)
     VALUES (?, ?, 'cliente', 1)`,
    [cleanEmail, password_hash]
  );

  return {
    ok: true,
    user: {
      id: result.insertId,
      email: cleanEmail,
      rol: "cliente",
    },
  };
}


export async function registerYLogin(pool, { email, password, meta }) {
  const cleanEmail = String(email).trim().toLowerCase();
  if (!cleanEmail.includes("@")) return { ok: false, error: "Email inválido" };
  if (String(password).length < 4) return { ok: false, error: "Password muy corta" };

  const [exists] = await pool.query(
    `SELECT id FROM eco_usuario WHERE email = ? LIMIT 1`,
    [cleanEmail]
  );
  if (exists.length > 0) return { ok: false, error: "Ese email ya está registrado" };

  const password_hash = await bcrypt.hash(password, 10);

  await pool.query(
    `INSERT INTO eco_usuario (email, password_hash, rol, activo)
     VALUES (?, ?, 'cliente', 1)`,
    [cleanEmail, password_hash]
  );

  // ✅ Reutilizamos tu login existente (crea tokens + sesión)
  return await loginConPassword(pool, { email: cleanEmail, password, meta });
}


