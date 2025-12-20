import bcrypt from "bcrypt";

const items = [
  { usuario: "admin@eco.local", pass: "admin" },
  { usuario: "cliente@eco.local", pass: "cliente" },
  { usuario: "operario@eco.local", pass: "operario" }
];

for (const it of items) {
  const hash = await bcrypt.hash(it.pass, 10);
  console.log(`${it.usuario} | ${it.pass} -> ${hash}`);
}
