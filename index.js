import express from "express";
import cors from "cors";
import "dotenv/config";
import { createPool } from "./src/config/db.js";

const app = express();

app.use(cors());
app.use(express.json());

const pool = createPool();

app.get("/health", async (req, res) => {
  try {
    const [rows] = await pool.query("SELECT 1 AS ok");
    res.json({ ok: true, db: rows?.[0]?.ok === 1 });
  } catch (err) {
    res.status(500).json({ ok: false, db: false, error: err.message });
  }
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Servidor escuchando en puerto ${PORT}`);
});
