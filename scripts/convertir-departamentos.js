// convertir-departamentos.js
const mysql = require('mysql2/promise');
require('dotenv').config();

(async () => {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME,
  });

  const [rows] = await conn.execute('SELECT id, departamento FROM suscriptores WHERE departamento IS NOT NULL');

  for (const row of rows) {
    const original = row.departamento;

    // Ya está en formato JSON, lo dejamos igual
    if (original.trim().startsWith('[')) {
      console.log(`🔍 Suscriptor ${row.id} ya está en formato JSON, omitiendo.`);
      continue;
    }

    // Procesar
    const lista = original
      .split(',')
      .map(dep => dep.trim())
      .filter(dep => dep.length > 0);

    const nuevoValor = JSON.stringify(lista);
    await conn.execute('UPDATE suscriptores SET departamento = ? WHERE id = ?', [nuevoValor, row.id]);
    console.log(`✅ Suscriptor ${row.id} actualizado: ${nuevoValor}`);
  }

  await conn.end();
})();
