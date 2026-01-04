import mysql from "mysql2/promise";

/**
 * Crea y devuelve un pool de conexión a MySQL
 * Las credenciales se leen desde variables de entorno (.env)
 */
export function createPool() {
  return mysql.createPool({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT),
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME,

    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    timezone: "Z",

  });
}
