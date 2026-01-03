import bcrypt from "bcrypt";

const users = [
  { email: "admin2@eco.local", pass: "Admin123!", nombre: "Admin", rol: "admin" },
  { email: "operario2@eco.local", pass: "Operario123!", nombre: "Operario", rol: "operario" },
  { email: "cliente2@eco.local", pass: "Cliente123!", nombre: "Cliente", rol: "cliente" },
];

for (const u of users) {
  const hash = await bcrypt.hash(u.pass, 10);

  console.log(`
-- ${u.nombre}
INSERT INTO eco_usuario (email, password_hash, nombre, rol, activo, email_verificado)
VALUES (
  '${u.email}',
  '${hash}',
  '${u.nombre}',
  '${u.rol}',
  1,
  1
);
`);
}
