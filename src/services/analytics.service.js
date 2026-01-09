// backend/src/services/analytics.service.js

export async function getTopProducts(pool, { days = 7, limit = 10 }) {
  const d = Number(days) || 7;
  const l = Number(limit) || 10;

  const [rows] = await pool.query(
    `
    SELECT
      i.producto_id                AS productoId,
      COALESCE(p.name, i.nombre_snapshot) AS nombre,
      p.image                      AS image,
      SUM(i.cantidad)              AS unidades,
      SUM(i.subtotal)              AS ingresos
    FROM eco_pedido_item i
    JOIN eco_pedido ped ON ped.id = i.pedido_id
    LEFT JOIN productos_test p ON p.id = i.producto_id
    WHERE ped.estado = 'listo'
      AND ped.created_at >= (NOW() - INTERVAL ? DAY)
    GROUP BY i.producto_id, nombre, p.image
    ORDER BY unidades DESC
    LIMIT ?
    `,
    [d, l]
  );

  return rows;
}

export async function getSummary(pool, { days = 7 }) {
  const d = Number(days) || 7;

  // 🔹 período actual
  const [[current]] = await pool.query(
    `
    SELECT
      COUNT(DISTINCT ped.id)        AS pedidosTotales,
      COALESCE(SUM(i.cantidad),0)   AS unidadesTotales,
      COALESCE(SUM(i.subtotal),0)   AS ingresosTotales
    FROM eco_pedido ped
    JOIN eco_pedido_item i ON i.pedido_id = ped.id
    WHERE ped.estado = 'listo'
      AND ped.created_at >= (NOW() - INTERVAL ? DAY)
    `,
    [d]
  );

  // 🔹 período anterior
  const [[previous]] = await pool.query(
    `
    SELECT
      COALESCE(SUM(i.cantidad),0) AS unidadesTotales
    FROM eco_pedido ped
    JOIN eco_pedido_item i ON i.pedido_id = ped.id
    WHERE ped.estado = 'listo'
      AND ped.created_at >= (NOW() - INTERVAL ? DAY * 2)
      AND ped.created_at <  (NOW() - INTERVAL ? DAY)
    `,
    [d, d]
  );

  const curr = Number(current?.unidadesTotales || 0);
  const prev = Number(previous?.unidadesTotales || 0);

  let unidadesPct = null;
  if (prev > 0) {
    unidadesPct = ((curr - prev) / prev) * 100;
  }

  return {
    current: {
      pedidosTotales: Number(current?.pedidosTotales || 0),
      unidadesTotales: curr,
      ingresosTotales: Number(current?.ingresosTotales || 0),
    },
    previous: {
      unidadesTotales: prev,
    },
    diff: {
      unidadesPct, // puede ser null si no hay histórico
    },
  };
}
