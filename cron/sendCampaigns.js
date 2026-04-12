// /cron/sendCampaigns.js
require('dotenv').config({ path: __dirname + '/../.env' });

const pool = require('../db');
const { registrarLog } = require('../db/queries/logs');
const { ejecutarEnvio, cierreAleatorio, saludoPorHora } = require('../utils/envioMotor');

async function enviarCampaniasProgramadas() {
  console.log(`🕓 [${new Date().toLocaleString('es-GT')}] Buscando mensajes de campaña pendientes...`);

  try {
    // 1. Buscar mensajes pendientes cuya hora ya llegó
    const [mensajes] = await pool.query(`
      SELECT cm.*, c.titulo, c.audiencia, c.filtros_departamentos, c.filtros_temas, c.tipo AS tipo_campania
      FROM campania_mensajes cm
      JOIN campanias c ON cm.id_campania = c.id
      WHERE cm.estado = 'pendiente'
      AND c.estado IN ('activa', 'enviando')
      AND cm.fecha_programada IS NOT NULL
      AND cm.fecha_programada <= NOW()
      ORDER BY cm.fecha_programada ASC
    `);

    if (!mensajes.length) {
      console.log('⏸️ No hay mensajes pendientes para enviar.');
      return;
    }

    console.log(`📣 Mensajes a enviar: ${mensajes.length}`);

    for (const msg of mensajes) {
      console.log(`\n📨 Procesando mensaje #${msg.id} de campaña "${msg.titulo}"`);

      // Marcar como enviando
      await pool.query(`UPDATE campania_mensajes SET estado='enviando' WHERE id=?`, [msg.id]);

      // === Obtener suscriptores según audiencia ===
      let subs = [];

      if (msg.audiencia === 'lista') {
        // Suscriptores específicos de la campaña
        const [rows] = await pool.query(`
          SELECT s.* FROM suscriptores s
          JOIN campania_suscriptores cs ON s.id = cs.id_suscriptor
          WHERE cs.id_campania = ? AND cs.estado = 'activo' AND s.estado = 'activo'
        `, [msg.id_campania]);
        subs = rows;

      } else {
        // Audiencia general con filtros opcionales
        let sql = `SELECT * FROM suscriptores WHERE estado='activo'`;
        const params = [];

        if (msg.audiencia === 'departamento' && msg.filtros_departamentos) {
          sql += ` AND JSON_OVERLAPS(departamento, ?)`;
          params.push(msg.filtros_departamentos);
        }

        if (msg.audiencia === 'tema' && msg.filtros_temas) {
          sql += ` AND JSON_OVERLAPS(temas, ?)`;
          params.push(msg.filtros_temas);
        }

        const [rows] = await pool.query(sql, params);
        subs = rows;
      }

      if (!subs.length) {
        console.log(`⚠️ Sin suscriptores para mensaje #${msg.id}`);
        await pool.query(`UPDATE campania_mensajes SET estado='enviado' WHERE id=?`, [msg.id]);
        continue;
      }

      console.log(`👥 Suscriptores: ${subs.length}`);

      // === Función de construcción de mensaje ===
      async function construirMensaje(sub) {
        const nombre = sub.nombre?.split(' ')[0] || '';
        const saludo = saludoPorHora();
        let texto = `${saludo} *${nombre}* 👋\n\n${msg.mensaje}`;
        texto += `\n\n${cierreAleatorio()}`;
        return texto;
      }

      // === Ejecutar envío con el motor ===
      const { enviados, errores, fallidos } = await ejecutarEnvio(
        subs,
        construirMensaje,
        {},
        {
          registrarLog,
          adminNumber: process.env.ADMIN_NUMBER,
          etiqueta: `campania_${msg.id_campania}_msg_${msg.id}`,
        }
      );

      // === Registrar envíos en campania_envios ===
      for (const sub of subs) {
        const fallido = fallidos.find(f => f.telefono === sub.telefono);
        await pool.query(
          `INSERT INTO campania_envios (id_campania, id_mensaje, id_suscriptor, numero, estado, error_detalle, fecha_envio)
           VALUES (?, ?, ?, ?, ?, ?, NOW())`,
          [
            msg.id_campania,
            msg.id,
            sub.id,
            sub.telefono,
            fallido ? 'error' : 'enviado',
            fallido ? fallido.error : null,
          ]
        );
      }

      // Marcar mensaje como enviado
      await pool.query(`UPDATE campania_mensajes SET estado='enviado' WHERE id=?`, [msg.id]);
      console.log(`✅ Mensaje #${msg.id} completado — enviados: ${enviados}, errores: ${errores}`);

      // Verificar si todos los mensajes de la campaña fueron enviados
      const [pendientes] = await pool.query(
        `SELECT COUNT(*) as total FROM campania_mensajes WHERE id_campania = ? AND estado = 'pendiente'`,
        [msg.id_campania]
      );

      if (pendientes[0].total === 0) {
        await pool.query(`UPDATE campanias SET estado='finalizada' WHERE id=?`, [msg.id_campania]);
        console.log(`🏁 Campaña #${msg.id_campania} finalizada.`);
      }
    }

    console.log('\n🟢 Proceso de campañas finalizado.');

  } catch (err) {
    console.error('❌ Error global en envío de campañas:', err);
  }
}

if (require.main === module) {
  enviarCampaniasProgramadas()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

module.exports = enviarCampaniasProgramadas;
