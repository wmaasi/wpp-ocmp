require('dotenv').config({ path: __dirname + '/../.env' });
const fetch = require('node-fetch');
const pool = require('../db');

const API_URL = 'http://localhost:3001/send-image';

const imagePath = '/home/william_maas/wpp-ocmp/uploads/20minutos260408.jpeg';

const message = `¡Este jueves tenemos #20minutoscon!
🚀 Hablaremos sobre el alza en el precio del transporte 💸 y cómo impacta a quienes dependen del servicio cada día.
Nos acompaña Ronald Peláez, del CEUR-USAC.
🕕 6:00 PM desde las redes de @_ojoconmipisto.
¡Participa con tus comentarios! 💬`;

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

      await new Promise(r => setTimeout(r, 3000)); // ⏱️ delay seguro
    }

    console.log('\n🎉 Envío masivo finalizado con éxito');
  } catch (err) {
    console.error('❌ Error general:', err);
  } finally {
    pool.end();
  }
}

enviarATodos();
