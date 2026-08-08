require('dotenv').config({ path: __dirname + '/../.env' });
const pool = require('../db');

async function expirarReactivacion() {
  console.log(`🕒 [${new Date().toLocaleString('es-GT')}] Verificando expiraciones...`);
  try {
    const [result] = await pool.query(`
      UPDATE reactivacion_campana 
      SET estado = 'expirado'
      WHERE estado = 'enviado'
      AND fecha_envio < DATE_SUB(NOW(), INTERVAL 7 DAY)
    `);
    console.log(`⏰ ${result.affectedRows} usuarios expirados.`);
  } catch (err) {
    console.error('❌ Error:', err.message);
  }
}

if (require.main === module) {
  expirarReactivacion()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

module.exports = expirarReactivacion;
