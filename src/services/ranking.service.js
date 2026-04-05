export async function getTopProductos(pool, { desde, hasta, limit = 10 }) {
  const params = [];
  let where = "";

  if (desde && hasta) {
    where = "WHERE r.fecha BETWEEN ? AND ?";
    params.push(desde, hasta);
  } else if (desde) {
    where = "WHERE r.fecha >= ?";
    params.push(desde);
  } else if (hasta) {
    where = "WHERE r.fecha <= ?";
    params.push(hasta);
  }

  params.push(Number(limit));

  const [rows] = await pool.query(
    `
    SELECT
      r.producto_id,
      SUM(r.cantidad_total) AS total_vendido,
      p.name,
      p.image,
      p.price
    FROM eco_ranking_producto_dia r
    JOIN productos_test p ON p.id = r.producto_id
    ${where}
    GROUP BY r.producto_id
    ORDER BY total_vendido DESC
    LIMIT ?
    `,
    params
  );

  return rows;
}