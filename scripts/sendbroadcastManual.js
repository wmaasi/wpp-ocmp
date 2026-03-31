// scripts/sendBroadcastManual.js
require('dotenv').config({ path: __dirname + '/../.env' });

const pool = require('../db');
const sendMessage = require('../bot/sendMessage');
const path = require('path');

const MENSAJE = `¡Llega la última #GuíaParaVecinos🤓 del año!
Aprende sobre el portal del Sistema Nacional de Inversión Pública (SNIP) con Sofía Menchú.

Conoce cómo fiscalizar el gasto público municipal💰 y los proyectos en desarrollo para tu comunidad.

¡Inscríbete aquí!👇
https://f.mtr.cool/feplvvvexh`;

const IMAGE_PATH = path.resolve(__dirname, '../uploads/guia.jpeg');

async function enviarBroadcast() {
  try {
    console.log('📤 Iniciando envío masivo manual...');

    const [suscriptores] = await pool.query(`
      SELECT numero
      FROM suscriptores
      WHERE estado = 'activo'
    `);

    console.log(`👥 Suscriptores a enviar: ${suscriptores.length}`);

    for (const s of suscriptores) {
      const numero = s.numero;

      try {
        await sendMessage.sendImage(
          numero,
          IMAGE_PATH,
          'guia.jpeg',
          MENSAJE
        );

        console.log(`✅ Enviado a ${numero}`);
        await new Promise(r => setTimeout(r, 2000)); // anti-bloqueo
      } catch (err) {
        console.error(`❌ Error con ${numero}:`, err.message);
      }
    }

    console.log('🎉 Envío masivo finalizado');
    process.exit(0);
  } catch (err) {
    console.error('❌ Error general:', err);
    process.exit(1);
  }
}

enviarBroadcast();
