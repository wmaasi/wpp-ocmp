// db/queries/logs.js
const pool = require('../../db');

async function obtenerLogs(pagina = 1, limite = 10) {
  const offset = (pagina - 1) * limite;
  const [rows] = await pool.query(
    'SELECT * FROM logs ORDER BY fecha DESC LIMIT ? OFFSET ?',
    [limite, offset]
  );
  return rows;
}

async function contarLogs() {
  const [rows] = await pool.query('SELECT COUNT(*) as total FROM logs');
  return rows[0].total;
}

async function registrarLog(numero, mensaje, estado = 'enviado') {
  await pool.query(
    'INSERT INTO logs (numero, mensaje, estado) VALUES (?, ?, ?)',
    [numero, mensaje, estado]
  );
}

module.exports = { obtenerLogs, contarLogs, registrarLog };