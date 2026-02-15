import { emitStaff } from "../realtime/pedidosHub.js";
import { emitStock } from "../realtime/stockHub.js";





/**
 * GET /api/productos
 * Público / cliente
 */
export async function obtenerProductos(req, res) {
  try {
    const pool = req.app.locals.pool;
    const q = String(req.query?.q || "").trim();

    // ✅ columnas livianas (NO mandamos image base64 en listados)
    const baseSelect = `
  SELECT
    id, name, price, priceOriginal, stock, status,
    barcode, barcode_normalized, description, categoria, subcategoria,
    (image IS NOT NULL AND LENGTH(image) > 0) AS has_image
  FROM productos_test
`;

    // ✅ sin búsqueda → TODOS
    if (!q) {
      const [rows] = await pool.query(
        `${baseSelect}
       WHERE status = 'activo'
        AND image IS NOT NULL AND LENGTH(image) > 0
          ORDER BY name ASC`
      );

      return res.json({ ok: true, data: rows });
    }

    // 🔹 búsqueda corta → LIKE por palabras
    if (q.length <= 8) {
      const terms = q
        .toLowerCase()
        .split(/\s+/)
        .map((t) => t.trim())
        .filter(Boolean);

      const whereParts = [];
      const values = [];

      for (const term of terms) {
        whereParts.push(`(
          name LIKE ?
          OR description LIKE ?
          OR barcode LIKE ?
          OR barcode_normalized LIKE ?
        )`);

        const like = `%${term}%`;
        values.push(like, like, like, like);
      }

      const whereSql = whereParts.join(" AND ");

      const [rows] = await pool.query(
        `${baseSelect}
 WHERE status = 'activo'
  AND image IS NOT NULL AND LENGTH(image) > 0
  AND ${whereSql}
 ORDER BY name ASC`,
        values
      );

      return res.json({ ok: true, data: rows });
    }

    // 🔹 búsqueda larga → FULLTEXT por relevancia
    const terms = q
      .toLowerCase()
      .split(/\s+/)
      .filter(Boolean);

    const qBoolean = terms.map((t) => `+${t}`).join(" ");

    const [rows] = await pool.query(
      `
     SELECT
  id, name, price, priceOriginal, stock, status,
  barcode, barcode_normalized, description, categoria, subcategoria,
  (image IS NOT NULL AND LENGTH(image) > 0) AS has_image,
  MATCH(name, description) AGAINST (? IN BOOLEAN MODE) AS score
  FROM productos_test
        WHERE status = 'activo'
  AND image IS NOT NULL AND LENGTH(image) > 0
  AND MATCH(name, description) AGAINST (? IN BOOLEAN MODE)
        ORDER BY score DESC, name ASC
      `,
      [qBoolean, qBoolean]
    );

    return res.json({ ok: true, data: rows });
  } catch (err) {
    console.error("Error obtenerProductos:", err);
    return res.status(500).json({
      ok: false,
      error: "Error al obtener productos",
    });
  }
}





/**
 * GET /api/productos/admin
 * Admin / Operario
 */
export async function obtenerProductosAdmin(req, res) {
  try {
    const pool = req.app.locals.pool;

    const onlyNoCategoria = String(req.query?.solo_sin_categoria || "") === "1";

    let rows;

    if (onlyNoCategoria) {

      [rows] = await pool.query(`
  SELECT
    id,
    name,
    price,
    status,
    barcode,
    categoria,
    subcategoria,
    stock
  FROM productos_test
  WHERE
    (categoria IS NULL OR TRIM(categoria) = '')
    AND (barcode IS NOT NULL AND TRIM(barcode) <> '')
  ORDER BY name ASC
`);

    } else {
      [rows] = await pool.query(`
        SELECT *
        FROM productos_test
        ORDER BY name ASC
      `);
    }

    return res.json({
      ok: true,
      data: rows,
    });
  } catch (err) {
    console.error("Error obtenerProductosAdmin:", err);
    return res.status(500).json({
      ok: false,
      error: "Error al obtener productos (admin)",
    });
  }
}


/**
 * PATCH /api/productos/:id
 * Admin / Operario
 */
export async function actualizarProducto(req, res) {
  try {
    const pool = req.app.locals.pool;
    const id = Number(req.params.id);

    if (!id) {
      return res.status(400).json({ ok: false, error: "ID inválido" });
    }

    const {
      name,
      price,
      image,
      status, // activo | inactivo
      stock,
      categoria,
    } = req.body || {};

    const fields = [];
    const values = [];

    if (name !== undefined) {
      fields.push("name = ?");
      values.push(name);
    }
    if (price !== undefined) {
      fields.push("price = ?");
      values.push(price);
    }
    if (stock !== undefined) {
      const n = Number(stock);

      if (!Number.isFinite(n) || !Number.isInteger(n) || n < 0) {
        return res.status(400).json({
          ok: false,
          error: "Stock inválido (debe ser entero >= 0)",
        });
      }

      fields.push("stock = ?");
      values.push(n);
    }

    if (image !== undefined) {
      fields.push("image = ?");
      values.push(image);
    }
    if (status !== undefined) {
      fields.push("status = ?");
      values.push(status);
    }

    if (categoria !== undefined) {
      const cat = String(categoria).trim();
      // permitimos null/"" para limpiar categoría
      fields.push("categoria = ?");
      values.push(cat ? cat : null);
    }


    if (fields.length === 0) {
      return res.status(400).json({
        ok: false,
        error: "Nada para actualizar",
      });
    }

    values.push(id);

    const [r] = await pool.query(
      `UPDATE productos_test SET ${fields.join(", ")} WHERE id = ?`,
      values
    );
    // si vino stock en el body, emitimos update para clientes logueados
    if (stock !== undefined) {

      const [[row]] = await pool.query(
        `SELECT stock FROM productos_test WHERE id = ?`,
        [id]
      );

      emitStock("stock_update", {
        productoId: id,
        stock: Number(row?.stock ?? 0),
      });
      emitStaff("reposicion_update", { productoId: id });
    }


    if (!r.affectedRows) {
      return res.status(404).json({
        ok: false,
        error: "Producto no encontrado",
      });

    }

    return res.json({
      ok: true,
      id,
    });
  } catch (err) {
    console.error("Error actualizarProducto:", err);
    return res.status(500).json({
      ok: false,
      error: "Error al actualizar producto",
    });
  }
}

/**
 * PATCH /api/productos/:id/stock
 * Body: { delta: number }  // ej: +5 repone, -2 descuenta
 * Admin / Operario
 */
export async function ajustarStockProducto(req, res) {
  try {
    const pool = req.app.locals.pool;
    const id = Number(req.params.id);

    if (!id) return res.status(400).json({ ok: false, error: "ID inválido" });

    const deltaRaw = req.body?.delta;
    const delta = Number(deltaRaw);

    if (!Number.isFinite(delta) || delta === 0) {
      return res.status(400).json({
        ok: false,
        error: "delta inválido (debe ser número distinto de 0)",
      });
    }

    // 1) Update seguro (si baja, no permitir negativo)
    let r;
    if (delta < 0) {
      const abs = Math.abs(delta);
      [r] = await pool.query(
        `UPDATE productos_test
         SET stock = stock - ?
         WHERE id = ? AND stock >= ?`,
        [abs, id, abs]
      );
      if (!r.affectedRows) {
        return res.status(409).json({
          ok: false,
          error: "Sin stock suficiente para descontar",
        });
      }
    } else {
      [r] = await pool.query(
        `UPDATE productos_test
         SET stock = stock + ?
         WHERE id = ?`,
        [delta, id]
      );
      if (!r.affectedRows) {
        return res.status(404).json({ ok: false, error: "Producto no encontrado" });
      }
    }

    // 2) Leer stock final
    const [[row]] = await pool.query(
      `SELECT stock FROM productos_test WHERE id = ? LIMIT 1`,
      [id]
    );

    const stockActual = Number(row?.stock ?? 0);

    // 3) Calcular nivel
    let nivel = "ok";
    if (stockActual <= 1) nivel = "critico";
    else if (stockActual <= 3) nivel = "bajo";

    // 4) Guardar histórico si quedó bajo/crítico
    if (nivel !== "ok") {
      await pool.query(
        `INSERT INTO eco_reposicion_alerta (producto_id, stock_en_evento, nivel)
         VALUES (?, ?, ?)`,
        [id, stockActual, nivel]
      );
    }

    // 5) Emitir SSE a staff (operario/admin)
    emitStaff("reposicion_update", {
      productoId: id,
      stock: stockActual,
      nivel, // "critico" | "bajo" | "ok"
      delta,
      at: new Date().toISOString(),
    });

    return res.json({
      ok: true,
      data: { productoId: id, stock: stockActual, nivel },
    });
  } catch (err) {
    console.error("Error ajustarStockProducto:", err);
    return res.status(500).json({
      ok: false,
      error: "Error al ajustar stock",
    });
  }
}

/**
 * GET /api/productos/:id/image
 * Devuelve SOLO la imagen (base64) de un producto
 */
export async function obtenerProductoImagen(req, res) {
  try {
    const pool = req.app.locals.pool;
    const id = Number(req.params.id);

    if (!id) return res.status(400).json({ ok: false, error: "ID inválido" });

    const [[row]] = await pool.query(
      `SELECT image FROM productos_test WHERE id = ? LIMIT 1`,
      [id]
    );

    const image = row?.image || null;

    return res.json({
      ok: true,
      data: { id, image },
    });
  } catch (err) {
    console.error("Error obtenerProductoImagen:", err);
    return res.status(500).json({ ok: false, error: "Error al obtener imagen" });
  }
}


/**
 * PATCH /api/productos/categoria
 * Body: { categoria: string|null, ids: number[] }
 * Admin / Operario
 */
export async function actualizarCategoriaMasiva(req, res) {
  try {
    const pool = req.app.locals.pool;

    const categoriaRaw = req.body?.categoria;
    const idsRaw = req.body?.ids;
    const subcategoriaRaw = req.body?.subcategoria;

    // ✅ validar ids
    if (!Array.isArray(idsRaw) || idsRaw.length === 0) {
      return res.status(400).json({
        ok: false,
        error: "ids inválidos (debe ser un array con al menos 1 elemento)",
      });
    }

    const ids = idsRaw
      .map((x) => Number(x))
      .filter((n) => Number.isFinite(n) && Number.isInteger(n) && n > 0);

    if (ids.length === 0) {
      return res.status(400).json({
        ok: false,
        error: "ids inválidos (deben ser enteros > 0)",
      });
    }

    // ✅ categoria: string o null (permitimos limpiar)
    let categoria = null;
    if (categoriaRaw !== null && categoriaRaw !== undefined) {
      const cat = String(categoriaRaw).trim();
      categoria = cat ? cat : null;
    }

    let subcategoria = null;
    if (subcategoriaRaw !== null && subcategoriaRaw !== undefined) {
      const sub = String(subcategoriaRaw).trim();
      subcategoria = sub ? sub : null;
    }

    // ✅ Reglas: subcategoria obligatoria solo en algunas categorías
    const requiresSub =
      categoria === "bebidas" ||
      categoria === "mascotas" ||
      categoria === "helados";

    const allowedSubs = {
      bebidas: new Set(["con_alcohol", "sin_alcohol"]),
      mascotas: new Set(["gato", "perro"]),
      helados: new Set(["conaprole", "crufi"]),
    };

    if (requiresSub && !subcategoria) {
      return res.status(400).json({
        ok: false,
        error: "Subcategoría requerida para esa categoría",
      });
    }

    if (requiresSub) {
      const ok = allowedSubs[categoria]?.has(subcategoria);
      if (!ok) {
        return res.status(400).json({
          ok: false,
          error: "Subcategoría inválida para esa categoría",
        });
      }
    } else {
      subcategoria = null; // limpia basura
    }



    // ✅ update masivo (placeholders seguros)
    const placeholders = ids.map(() => "?").join(",");
    const [r] = await pool.query(
      `UPDATE productos_test
   SET categoria = ?, subcategoria = ?
   WHERE id IN (${placeholders})`,
      [categoria, subcategoria, ...ids]
    );

    // Emitimos para staff para que refresquen paneles si están escuchando
    emitStaff("productos_update", {
      tipo: "categoria_masiva",
      categoria,
      subcategoria,
      ids,
      updated: r.affectedRows || 0,
      at: new Date().toISOString(),
    });

    return res.json({
      ok: true,
      data: {
        categoria,
        ids,
        updated: r.affectedRows || 0,
      },
    });
  } catch (err) {
    console.error("Error actualizarCategoriaMasiva:", err);
    return res.status(500).json({
      ok: false,
      error: "Error al actualizar categoría (masivo)",
    });
  }
}


/**
 * GET /api/productos/barcode/:barcode
 * Admin / Operario
 * Devuelve 1 producto por barcode exacto (sin image base64)
 */
export async function obtenerProductoPorBarcode(req, res) {
  try {
    const pool = req.app.locals.pool;
    const raw = String(req.params.barcode || "").trim();

    if (!raw) {
      return res.status(400).json({ ok: false, error: "Barcode requerido" });
    }

    // ✅ búsqueda exacta (usa UNIQUE/INDEX del barcode)
    const [[row]] = await pool.query(
      `
      SELECT
        id, name, price, priceOriginal, stock, status,
        barcode, barcode_normalized, description, categoria, subcategoria,
        (image IS NOT NULL AND LENGTH(image) > 0) AS has_image
      FROM productos_test
      WHERE barcode = ?
      LIMIT 1
      `,
      [raw]
    );

    if (!row) {
      return res.status(404).json({ ok: false, error: "Producto no encontrado" });
    }

    return res.json({ ok: true, data: row });
  } catch (err) {
    console.error("Error obtenerProductoPorBarcode:", err);
    return res.status(500).json({ ok: false, error: "Error al buscar producto" });
  }
}

/**
 * POST /api/productos
 * Operario / Admin
 * Body: { barcode, name, price }
 * Crea el producto si no existe. Si ya existe, devuelve 409.
 */
export async function crearProductoRapido(req, res) {
  try {
    const pool = req.app.locals.pool;

    const barcode = String(req.body?.barcode || "").trim();
    const name = String(req.body?.name || "").trim();
    const priceRaw = req.body?.price;

    if (!barcode) {
      return res.status(400).json({ ok: false, error: "barcode requerido" });
    }
    if (name.length < 2) {
      return res.status(400).json({ ok: false, error: "Nombre requerido" });
    }

    const price = Number(priceRaw);
    if (!Number.isFinite(price) || price < 0) {
      return res.status(400).json({ ok: false, error: "Precio inválido" });
    }

    // Si ya existe, 409 (front puede reintentar GET)
    const [[exists]] = await pool.query(
      `SELECT id FROM productos_test WHERE barcode = ? LIMIT 1`,
      [barcode]
    );
    if (exists) {
      return res.status(409).json({ ok: false, error: "Ese barcode ya existe" });
    }

    // Insert mínimo (stock default ya lo pone la tabla)
    const [r] = await pool.query(
      `
      INSERT INTO productos_test (name, price, barcode, status)
      VALUES (?, ?, ?, 'activo')
      `,
      [name, price, barcode]
    );

    const newId = r.insertId;

    // devolver producto “tipo scan” (sin image)
    const [[row]] = await pool.query(
      `
      SELECT
        id, name, price, priceOriginal, stock, status,
        barcode, barcode_normalized, description, categoria, subcategoria,
        (image IS NOT NULL AND LENGTH(image) > 0) AS has_image
      FROM productos_test
      WHERE id = ?
      LIMIT 1
      `,
      [newId]
    );

    // avisar a staff si querés refrescar paneles
    emitStaff("productos_update", {
      tipo: "alta_rapida",
      productoId: newId,
      barcode,
      at: new Date().toISOString(),
    });

    return res.status(201).json({ ok: true, data: row });
  } catch (err) {
    console.error("crearProductoRapido error:", err);
    return res.status(500).json({ ok: false, error: "Error al crear producto" });
  }
}

/**
 * POST /api/productos/barcode/:barcode
 * Admin / Operario
 * Crea un producto mínimo (name + price) y guarda barcode.
 */
export async function crearProductoPorBarcode(req, res) {
  try {
    const pool = req.app.locals.pool;

    const barcode = String(req.params.barcode || "").trim();
    if (!barcode) return res.status(400).json({ ok: false, error: "Barcode requerido" });

    const nameRaw = req.body?.name;
    const priceRaw = req.body?.price;

    const name = String(nameRaw || "").trim();
    const price = Number(priceRaw);

    if (name.length < 2) {
      return res.status(400).json({ ok: false, error: "Nombre requerido" });
    }
    if (!Number.isFinite(price) || price < 0) {
      return res.status(400).json({ ok: false, error: "Precio inválido" });
    }

    // Si ya existe, devolvemos 409 (para que el front lo trate prolijo)
    const [[exists]] = await pool.query(
      `SELECT id FROM productos_test WHERE barcode = ? LIMIT 1`,
      [barcode]
    );
    if (exists) {
      return res.status(409).json({ ok: false, error: "Ese código ya existe" });
    }

    // Insert mínimo. (stock default 10 ya está en tabla)
    const [r] = await pool.query(
      `
      INSERT INTO productos_test (name, price, barcode, status)
      VALUES (?, ?, ?, 'activo')
      `,
      [name, price, barcode]
    );

    const id = r.insertId;

    const [[row]] = await pool.query(
      `
      SELECT
        id, name, price, priceOriginal, stock, status,
        barcode, barcode_normalized, description, categoria, subcategoria,
        (image IS NOT NULL AND LENGTH(image) > 0) AS has_image
      FROM productos_test
      WHERE id = ?
      LIMIT 1
      `,
      [id]
    );

    return res.status(201).json({ ok: true, data: row });
  } catch (err) {
    console.error("crearProductoPorBarcode error:", err);
    return res.status(500).json({ ok: false, error: "Error al crear producto" });
  }
}

/**
 * DELETE /api/productos/:id
 * Admin / Operario
 */
export async function eliminarProducto(req, res) {
  try {
    const pool = req.app.locals.pool;
    const id = Number(req.params.id);

    if (!id) {
      return res.status(400).json({ ok: false, error: "ID inválido" });
    }

    const [r] = await pool.query(
      `DELETE FROM productos_test WHERE id = ?`,
      [id]
    );

    if (!r.affectedRows) {
      return res.status(404).json({ ok: false, error: "Producto no encontrado" });
    }

    emitStaff("productos_update", {
      tipo: "delete",
      productoId: id,
      at: new Date().toISOString(),
    });

    return res.json({ ok: true, id });
  } catch (err) {
    // ✅ mysql2 puede tirar WARN_DATA_TRUNCATED como error aunque el DELETE haya ocurrido
    if (err?.code === "WARN_DATA_TRUNCATED") {
      try {
        const pool = req.app.locals.pool;
        const id = Number(req.params.id);

        // si el producto ya no existe, consideramos el delete OK
        const [[stillThere]] = await pool.query(
          `SELECT id FROM productos_test WHERE id = ? LIMIT 1`,
          [id]
        );

        if (!stillThere) {
          return res.json({ ok: true, id });
        }
      } catch {
        // si falla este check, seguimos al error normal
      }
    }

    console.error("Error eliminarProducto:", err);
    return res.status(500).json({
      ok: false,
      error: "Error al eliminar producto",
    });
  }

}





