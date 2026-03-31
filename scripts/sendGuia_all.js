require('dotenv').config({ path: __dirname + '/../.env' });
const fetch = require('node-fetch');
const pool = require('../db');

const API_URL = 'http://localhost:3001/send-image';

const imagePath = '/home/william_maas/wpp-ocmp/uploads/guiavecinos.jpeg';

const message = `¡Llega la primera #GuíaParaVecinos🤓 del año!🚀
Este miércoles 21 de enero aprende sobre los presupuestos municipales y el situado constitucional con el que cuentan las alcaldías para 2026, con Erick Coyoy, coordinador de @ASIES_GT. ¡Inscríbete aquí!⚡️👇
https://bit.ly/GuiaParaVecinosOjoconmipisto`;

async function enviarATodos() {
  try {
    const [suscriptores] = await pool.query(
      "SELECT telefono FROM suscriptores WHERE estado='activo'"
    );

    console.log(`📤 Enviando guía a ${suscriptores.length} suscriptores...\n`);

    for (const s of suscriptores) {
      try {
        const res = await fetch(API_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            to: s.telefono,
            imagePath,
            caption: message,
          }),
        });

        const data = await res.json();
        if (data.result === 'success') {
          console.log(`✅ Enviado a ${s.telefono}`);
        } else {
          console.warn(`⚠️ Error con ${s.telefono}:`, data);
        }
      } catch (err) {
        console.error(`❌ Error con ${s.telefono}:`, err.message);
      }

      await new Promise(r => setTimeout(r, 1500)); // ⏱️ delay seguro
    }

    console.log('\n🎉 Envío masivo finalizado con éxito');
  } catch (err) {
    console.error('❌ Error general:', err);
  } finally {
    pool.end();
  }
}

enviarATodos();
