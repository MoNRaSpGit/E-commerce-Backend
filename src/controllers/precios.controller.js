

const CATS = new Set(["frutas_verduras", "congelados", "remedios"]);

function isValidCat(cat) {
    return CATS.has(String(cat || "").trim());
}

export async function preciosList(req, res) {
    const pool = req.app.locals.pool;

    if (!pool) {
        return res.status(500).json({ ok: false, error: "DB no inicializada" });
    }
    try {
        const categoria = String(req.query.categoria || "").trim();

        if (!isValidCat(categoria)) {
            return res.status(400).json({
                ok: false,
                error: "Categoria inválida. Usá: frutas_verduras | congelados | remedios",
            });
        }

        const [rows] = await req.app.locals.pool.query(
            `
      SELECT id, categoria, nombre, precio, unidad, orden, activo, updated_at
      FROM eco_precio_manual
      WHERE categoria = ? AND activo = 1
      ORDER BY orden ASC, nombre ASC
      `,
            [categoria]
        );

        return res.json({ ok: true, data: rows });
    } catch (e) {
        return res.status(500).json({ ok: false, error: e?.message || "Error" });
    }
}

export async function preciosUpdate(req, res) {
    const pool = req.app.locals.pool;

    if (!pool) {
        return res.status(500).json({ ok: false, error: "DB no inicializada" });
    }
    try {
        const id = Number(req.params.id);
        const precio = Number(String(req.body?.precio ?? "").replace(",", "."));

        if (!Number.isFinite(id) || id <= 0) {
            return res.status(400).json({ ok: false, error: "ID inválido" });
        }
        if (!Number.isFinite(precio) || precio < 0) {
            return res.status(400).json({ ok: false, error: "Precio inválido" });
        }

        const [r] = await req.app.locals.pool.query(
            `UPDATE eco_precio_manual SET precio = ? WHERE id = ? LIMIT 1`,
            [precio, id]
        );

        if (r.affectedRows === 0) {
            return res.status(404).json({ ok: false, error: "No existe" });
        }

        const [rows] = await req.app.locals.pool.query(
            `
      SELECT id, categoria, nombre, precio, unidad, orden, activo, updated_at
      FROM eco_precio_manual
      WHERE id = ?
      LIMIT 1
      `,
            [id]
        );

        return res.json({ ok: true, data: rows[0] || null });
    } catch (e) {
        return res.status(500).json({ ok: false, error: e?.message || "Error" });
    }
}