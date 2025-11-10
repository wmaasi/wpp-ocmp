// scripts/sendCampaigns.js
require('dotenv').config({ path: __dirname + '/../.env' });
const pool = require('../db');
const sendMessage = require('../bot/sendMessage');

(async () => {
  console.log('🕓 Revisando campañas programadas...');
  const [pendientes] = await pool.query(`
    SELECT * FROM campanias
    WHERE estado = 'pendiente'
      AND fecha_programada IS NOT NULL
      AND fecha_programada <= NOW()
  `);

  for (const c of pendientes) {
    console.log(`🚀 Ejecutando campaña programada: ${c.titulo}`);
    await pool.query('UPDATE campanias SET estado="enviando" WHERE id=?', [c.id]);

    const filtros = [];
    const params = [];
    let sql = "SELECT * FROM suscriptores WHERE estado='activo'";
    if (c.filtros_departamentos) {
      filtros.push(`JSON_OVERLAPS(departamento, ?)`);
      params.push(c.filtros_departamentos);
    }
    if (c.filtros_temas) {
      filtros.push(`JSON_OVERLAPS(temas, ?)`);
      params.push(c.filtros_temas);
    }
    if (filtros.length) sql += " AND " + filtros.join(' AND ');

    const [subs] = await pool.query(sql, params);

    for (const s of subs) {
      try {
        await sendMessage(s.telefono, c.mensaje);
        await pool.query(
          'INSERT INTO campania_envios (id_campania, id_suscriptor, numero, estado, fecha_envio) VALUES (?, ?, ?, "enviado", NOW())',
          [c.id, s.id, s.telefono]
        );
      } catch (err) {
        console.error('Error enviando a', s.telefono, err.message);
        await pool.query(
          'INSERT INTO campania_envios (id_campania, id_suscriptor, numero, estado) VALUES (?, ?, ?, "error")',
          [c.id, s.id, s.telefono]
        );
      }
    }

    await pool.query('UPDATE campanias SET estado="enviada" WHERE id=?', [c.id]);
  }

  console.log('✅ Campañas revisadas.');
  process.exit();
})();