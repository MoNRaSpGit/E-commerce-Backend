// backend/src/controllers/op999.controller.js

function parseDataUrl(dataUrl) {
  // data:image/png;base64,AAAA...
  if (!dataUrl || typeof dataUrl !== "string") return null;
  const m = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!m) return null;
  const mime = m[1];
  const b64 = m[2];
  try {
    const buf = Buffer.from(b64, "base64");
    return { mime, buf };
  } catch {
    return null;
  }
}

/**
 * GET /api/op999/productos?solo_con_barcode=1&price_eq=999
 * Operario/Admin (lista liviana)
 */
export async function op999List(req, res) {
  try {
    const pool = req.app.locals.pool;

    const soloConBarcode = String(req.query?.solo_con_barcode || "") === "1";
    const priceEqRaw = req.query?.price_eq;
    const priceEq = priceEqRaw !== undefined ? Number(priceEqRaw) : null;

    const where = [];
    const values = [];

    // siempre respetamos barcode si viene el flag
    if (soloConBarcode) {
      where.push("(barcode IS NOT NULL AND TRIM(barcode) <> '')");
    }

    // Nuevo: si viene price_eq, traemos (price = price_eq) OR (sin imagen)
    if (priceEq !== null && Number.isFinite(priceEq)) {
      where.push(`(
  price = ?
  OR status = 'pendiente'
  OR image IS NULL
  OR TRIM(image) = ''
)`);
      values.push(priceEq);
    }

    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";


    const [rows] = await pool.query(
      `
      SELECT
        id, name, price, barcode, stock, status,
        CASE WHEN image IS NULL OR TRIM(image) = '' THEN 0 ELSE 1 END AS has_image
      FROM productos_test
      ${whereSql}
      ORDER BY name ASC
      `,
      values
    );

    return res.json({ ok: true, data: rows });
  } catch (err) {
    console.error("op999List error:", err);
    return res.status(500).json({ ok: false, error: "Error al listar (op999)" });
  }
}

/**
 * GET /api/op999/productos/:id/image
 * Público (sin auth) para que <img src="..."> funcione.
 * Devuelve BINARIO + Content-Type real.
 */
export async function op999Image(req, res) {
  try {
    const pool = req.app.locals.pool;
    const id = Number(req.params.id);

    if (!id) return res.status(400).end();

    const [[row]] = await pool.query(
      `SELECT image FROM productos_test WHERE id = ? LIMIT 1`,
      [id]
    );

    const image = row?.image || "";
    const parsed = parseDataUrl(image);

    if (!parsed || !parsed.buf?.length) {
      return res.status(404).end();
    }

    res.setHeader("Content-Type", parsed.mime);
    res.setHeader("Cache-Control", "no-store");
    return res.status(200).send(parsed.buf);
  } catch (err) {
    console.error("op999Image error:", err);
    return res.status(500).end();
  }
}

/**
 * PATCH /api/op999/productos/:id
 * Operario/Admin
 * Body: { name, price, image }
 * - image: dataURL base64 para setear
 * - image: "" para borrar
 */
export async function op999Update(req, res) {
  try {
    const pool = req.app.locals.pool;
    const id = Number(req.params.id);

    if (!id) {
      return res.status(400).json({ ok: false, error: "ID inválido" });
    }

    const { name, price, image } = req.body || {};

    const fields = [];
    const values = [];

    if (name !== undefined) {
      const n = String(name || "").trim();
      if (n.length < 2) return res.status(400).json({ ok: false, error: "Nombre inválido" });
      fields.push("name = ?");
      values.push(n);
    }

    if (price !== undefined) {
      const p = Number(String(price).replace(",", "."));
      if (!Number.isFinite(p) || p < 0) return res.status(400).json({ ok: false, error: "Precio inválido" });
      fields.push("price = ?");
      values.push(p);
    }

    if (image !== undefined) {
      // "" => borrar
      if (String(image) === "") {
        fields.push("image = NULL");
      } else {
        // dataURL => setear
        const parsed = parseDataUrl(String(image));
        if (!parsed) return res.status(400).json({ ok: false, error: "Imagen inválida" });
        fields.push("image = ?");
        values.push(String(image));
      }
    }

    if (fields.length === 0) {
      return res.status(400).json({ ok: false, error: "Nada para actualizar" });
    }

    values.push(id);

    const [r] = await pool.query(
      `UPDATE productos_test SET ${fields.join(", ")} WHERE id = ?`,
      values
    );

    if (!r.affectedRows) {
      return res.status(404).json({ ok: false, error: "Producto no encontrado" });
    }

    return res.json({ ok: true, id });
  } catch (err) {
    console.error("op999Update error:", err);
    return res.status(500).json({ ok: false, error: "Error al actualizar (op999)" });
  }
}
