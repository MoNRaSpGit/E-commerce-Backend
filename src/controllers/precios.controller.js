
const MANUAL_CATS = new Set(["frutas", "verduras", "facturas"]);
const PANEL_CATS = new Set(["congelados", "remedios"]);

function isValidCat(cat) {
    const c = String(cat || "").trim();
    return MANUAL_CATS.has(c) || PANEL_CATS.has(c);
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
                error: "Categoria inválida. Usá: frutas | verduras | facturas | congelados | remedios",
            });
        }

        let rows = [];

        if (MANUAL_CATS.has(categoria)) {
            const [r] = await pool.query(
                `
        SELECT
          id,
          categoria,
          nombre,
          precio,
          unidad,
          orden,
          activo,
          updated_at,
          'manual' AS source,
          NULL AS producto_id
        FROM eco_precio_manual
        WHERE categoria = ? AND activo = 1
        ORDER BY orden ASC, nombre ASC
        `,
                [categoria]
            );
            rows = r;
        } else {
            // PANEL: productos_test (name/price) + tabla puente eco_precios_panel
            const [r] = await pool.query(
                `
        SELECT
          pt.id AS id,
          p.panel_categoria AS categoria,
          pt.name AS nombre,
          pt.price AS precio,
          pt.image AS image,
          NULL AS unidad,
          p.orden AS orden,
          p.activo AS activo,
          p.updated_at AS updated_at,
          'producto' AS source,
          pt.id AS producto_id
        FROM eco_precios_panel p
        INNER JOIN productos_test pt ON pt.id = p.producto_id
        WHERE p.panel_categoria = ? AND p.activo = 1
        ORDER BY p.orden ASC, pt.name ASC
        `,
                [categoria]
            );
            rows = r;
        }

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
        const source = String(req.body?.source || "manual").trim();
        const productoId = Number(req.body?.producto_id ?? id);

        if (!Number.isFinite(id) || id <= 0) {
            return res.status(400).json({ ok: false, error: "ID inválido" });
        }
        if (!Number.isFinite(precio) || precio < 0) {
            return res.status(400).json({ ok: false, error: "Precio inválido" });
        }

        let r;

        if (source === "producto") {
            if (!Number.isFinite(productoId) || productoId <= 0) {
                return res.status(400).json({ ok: false, error: "producto_id inválido" });
            }

            const [upd] = await pool.query(
                `UPDATE productos_test SET price = ? WHERE id = ? LIMIT 1`,
                [precio, productoId]
            );
            r = upd;
        } else {
            const [upd] = await pool.query(
                `UPDATE eco_precio_manual SET precio = ? WHERE id = ? LIMIT 1`,
                [precio, id]
            );
            r = upd;
        }

        if (r.affectedRows === 0) {
            return res.status(404).json({ ok: false, error: "No existe" });
        }

        if (source === "producto") {
            const [rows] = await pool.query(
                `
        SELECT
          pt.id AS id,
          p.panel_categoria AS categoria,
          pt.name AS nombre,
          pt.price AS precio,
          NULL AS unidad,
          p.orden AS orden,
          p.activo AS activo,
          p.updated_at AS updated_at,
          'producto' AS source,
          pt.id AS producto_id
        FROM eco_precios_panel p
        INNER JOIN productos_test pt ON pt.id = p.producto_id
        WHERE pt.id = ?
        LIMIT 1
        `,
                [productoId]
            );

            return res.json({ ok: true, data: rows[0] || null });
        }

        const [rows] = await pool.query(
            `
    SELECT
      id,
      categoria,
      nombre,
      precio,
      unidad,
      orden,
      activo,
      updated_at,
      'manual' AS source,
      NULL AS producto_id
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