// /cron/sendReactivacion.js
require('dotenv').config({ path: __dirname + '/../.env' });

const pool = require('../db');
const sendMessage = require('../bot/sendMessage');

const LIMITE_DIARIO = 25;
const MENSAJE = `Hola 👋 Gracias por tu interés 🔎 en las noticias municipales y en el trabajo de Ojoconmipisto.

¿Qué departamentos te interesa seguir?

Puedes escribir uno o varios, por ejemplo: *Guatemala*, *Quetzaltenango y Petén*`;

async function enviarReactivacion() {
  console.log(`🕒 [${new Date().toLocaleString('es-GT')}] Iniciando envío de reactivación...`);

  try {
    // Obtener pendientes que no han sido enviados aún
    const [pendientes] = await pool.query(`
      SELECT rc.id, rc.id_suscriptor, rc.telefono, s.nombre
      FROM reactivacion_campana rc
      JOIN suscriptores s ON rc.id_suscriptor = s.id
      WHERE rc.estado = 'pendiente'
      ORDER BY rc.fecha_creacion ASC
      LIMIT ?
    `, [LIMITE_DIARIO]);

    if (!pendientes.length) {
      console.log('⏸️ No hay usuarios pendientes de reactivación.');
      return;
    }

    console.log(`📤 Enviando a ${pendientes.length} usuarios...`);

    let enviados = 0;
    let errores = 0;

    for (const sub of pendientes) {
      try {
        const nombre = sub.nombre?.split(' ')[0] || '';
        const mensaje = `Hola *${nombre}* 👋 Gracias por tu interés 🔎 en las noticias municipales y en el trabajo de Ojoconmipisto.\n\n¿Qué departamentos te interesa seguir?\n\nPuedes escribir uno o varios, por ejemplo: *Guatemala*, *Quetzaltenango y Petén*`;

        await sendMessage(sub.telefono, mensaje);

        // Marcar como enviado
        await pool.query(
          `UPDATE reactivacion_campana SET estado = 'enviado', fecha_envio = NOW() WHERE id = ?`,
          [sub.id]
        );

        console.log(`✅ Enviado a ${sub.telefono} (${sub.nombre})`);
        enviados++;

        // Delay entre mensajes (10-20 segundos)
        const delay = Math.floor(Math.random() * 10000) + 10000;
        await new Promise(r => setTimeout(r, delay));

      } catch (err) {
        console.error(`❌ Error enviando a ${sub.telefono}:`, err.message);
        errores++;
      }
    }

    console.log(`\n📊 Resumen: ✅ ${enviados} enviados, ❌ ${errores} errores`);

    // Verificar cuántos quedan
    const [[{ restantes }]] = await pool.query(
      `SELECT COUNT(*) as restantes FROM reactivacion_campana WHERE estado = 'pendiente'`
    );
    console.log(`📋 Usuarios pendientes restantes: ${restantes}`);

  } catch (err) {
    console.error('❌ Error global:', err.message);
  }
}

if (require.main === module) {
  enviarReactivacion()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

module.exports = enviarReactivacion;
