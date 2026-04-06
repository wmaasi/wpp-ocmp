// /cron/sendCampaigns.js
require('dotenv').config({ path: __dirname + '/../.env' });

const pool = require('../db');
const sendMessage = require('../bot/sendMessage');
const { registrarLog } = require('../db/queries/logs');

async function enviarCampaniasProgramadas() {
  console.log(`🕓 [${new Date().toLocaleString('es-GT')}] Buscando campañas pendientes...`);

  try {
    // 1️⃣ Buscar campañas pendientes cuya hora ya llegó
    const [campanias] = await pool.query(`
      SELECT * FROM campanias
      WHERE estado = 'pendiente'
      AND fecha_programada IS NOT NULL
      AND fecha_programada <= NOW()
    `);

    if (!campanias.length) {
      console.log('⏸️ No hay campañas pendientes para enviar.');
      return;
    }

    for (const camp of campanias) {
      console.log(`📣 Enviando campaña #${camp.id}: ${camp.titulo}`);

      // Cambiar estado a "enviando"
      await pool.query(`UPDATE campanias SET estado='enviando' WHERE id=?`, [camp.id]);

      // Obtener filtros
      const filtros = [];
      const params = [];

      if (camp.filtros_departamentos) filtros.push(`JSON_OVERLAPS(departamento, ?)`);
      if (camp.filtros_temas) filtros.push(`JSON_OVERLAPS(temas, ?)`);

      let sql = `SELECT * FROM suscriptores WHERE estado='activo'`;
      if (filtros.length > 0) sql += ` AND ${filtros.join(' AND ')}`;

      if (camp.filtros_departamentos) params.push(camp.filtros_departamentos);
      if (camp.filtros_temas) params.push(camp.filtros_temas);

      const [subs] = await pool.query(sql, params);

      if (!subs.length) {
        console.log(`⚠️ No hay suscriptores para la campaña "${camp.titulo}".`);
        await pool.query(`UPDATE campanias SET estado='enviada' WHERE id=?`, [camp.id]);
        continue;
      }

      let enviados = 0;
      for (const s of subs) {
        try {
          await sendMessage(s.telefono, camp.mensaje);
          await registrarLog(s.telefono, camp.mensaje, 'campania_enviada');
          await pool.query(
            'INSERT INTO campania_envios (id_campania, id_suscriptor, numero, estado, fecha_envio) VALUES (?, ?, ?, "enviado", NOW())',
            [camp.id, s.id, s.telefono]
          );
          enviados++;
        } catch (err) {
          console.error(`❌ Error enviando a ${s.telefono}:`, err.message);
          await registrarLog(s.telefono, `Error en campaña ${camp.id}: ${err.message}`, 'error');
          await pool.query(
            'INSERT INTO campania_envios (id_campania, id_suscriptor, numero, estado) VALUES (?, ?, ?, "error")',
            [camp.id, s.id, s.telefono]
          );
        }
        await new Promise(r => setTimeout(r, 1000)); // delay de 1s
      }

      console.log(`✅ Campaña #${camp.id} enviada a ${enviados} suscriptores.`);
      await pool.query(`UPDATE campanias SET estado='enviada' WHERE id=?`, [camp.id]);
    }

    console.log('🟢 Finalizado.');

  } catch (err) {
    console.error('❌ Error global en envío de campañas:', err);
  } 
}

// Ejecutar si se llama directamente
if (require.main === module) {
  enviarCampaniasProgramadas()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

module.exports = enviarCampaniasProgramadas;
