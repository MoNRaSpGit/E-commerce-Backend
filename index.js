import express from "express";
import cors from "cors";
import "dotenv/config";

import { createPool } from "./src/config/db.js";
import productosRoutes from "./src/routes/productos.routes.js";
import authRoutes from "./src/routes/auth.routes.js";
import { requireAuth, requireRole } from "./src/middlewares/auth.js";
import pedidosRoutes from "./src/routes/pedidos.routes.js";
import reposicionRoutes from "./src/routes/reposicion.routes.js";
import stockRoutes from "./src/routes/stock.routes.js";
import analyticsRoutes from "./src/routes/analytics.routes.js";
import pushRoutes from "./src/routes/push.routes.js";




const app = express();
app.set("trust proxy", 1); // ✅ Render / reverse proxy

/// Middlewares base
const allowedOrigins = [
  "http://localhost:5173",
  "https://monraspgit.github.io",
];

app.use(
  cors({
    origin: (origin, cb) => {
      if (!origin) return cb(null, true); // Postman / curl
      if (allowedOrigins.includes(origin)) return cb(null, true);
      return cb(new Error("Not allowed by CORS"));
    },
  })
);

app.use(express.json());

// DB pool disponible globalmente
app.locals.pool = createPool();

// Health check
app.get("/health", async (req, res) => {
  try {
    const [rows] = await app.locals.pool.query("SELECT 1 AS ok");
    res.json({ ok: true, db: rows?.[0]?.ok === 1 });
  } catch (err) {
    res.status(500).json({ ok: false, db: false });
  }
});

// Rutas públicas
app.use("/api/productos", productosRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/pedidos", pedidosRoutes);
app.use("/api/reposicion", reposicionRoutes);
app.use("/api/push", pushRoutes);


// Rutas protegidas (solo para pruebas de roles)
app.get("/api/privado", requireAuth, (req, res) => {
  res.json({ ok: true, user: req.user });
});

app.get("/api/admin", requireAuth, requireRole("admin"), (req, res) => {
  res.json({ ok: true, mensaje: "Solo admin", user: req.user });
});

app.get("/api/operario", requireAuth, requireRole("admin", "operario"), (req, res) => {
  res.json({ ok: true, mensaje: "Admin u operario", user: req.user });
});

app.use("/api/stock", stockRoutes);
app.use("/api/analytics", analyticsRoutes);

// Server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor escuchando en puerto ${PORT}`);
});
