const pool = require('../db');

async function getMensajeEspecial() {
  const [rows] = await pool.query(
    `SELECT mensaje, posicion 
     FROM mensajes_especiales 
     WHERE fecha = CURDATE() AND activo = 1 
     LIMIT 1`
  );
  return rows.length ? rows[0] : null;
}

module.exports = getMensajeEspecial;
