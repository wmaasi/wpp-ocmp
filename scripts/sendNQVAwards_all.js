require('dotenv').config({ path: __dirname + '/../.env' });
const fetch = require('node-fetch');
const pool = require('../db');

const API_URL = 'http://localhost:3001/send-image';

// 🖼️ Imágenes a enviar (orden importa)
const images = [
  '/home/william_maas/wpp-ocmp/images/imagen06.jpeg',
  '/home/william_maas/wpp-ocmp/images/imagen07.jpeg',
  '/home/william_maas/wpp-ocmp/images/imagen08.jpeg',
  '/home/william_maas/wpp-ocmp/images/imagen09.jpeg',
  '/home/william_maas/wpp-ocmp/images/imagen10.jpeg',
];

// 📝 Texto (solo en la primera imagen)
const message = `El listado de ayer de los los #NQVAwards2025 🏆 (Nada Que Ver) está incompleto. Aquí están los otros ganadores. 

Por cierto ¿tu alcalde debió de ser nominado?`;

async function enviarATodos() {
  try {
    const [suscriptores] = await pool.query(
      "SELECT telefono FROM suscriptores WHERE estado='activo'"
    );

    console.log(`📤 Enviando NQVAwards a ${suscriptores.length} suscriptores...\n`);

    for (const s of suscriptores) {
      console.log(`➡️ Enviando a ${s.telefono}`);

      for (let i = 0; i < images.length; i++) {
        try {
          const res = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              to: s.telefono,
              imagePath: images[i],
              caption: i === 0 ? message : '',
            }),
          });

          const data = await res.json();
          if (data.result === 'success') {
            console.log(`   🖼️ Imagen ${i + 1} enviada`);
          } else {
            console.warn(`   ⚠️ Error imagen ${i + 1}:`, data);
          }
        } catch (err) {
          console.error(`   ❌ Error imagen ${i + 1}:`, err.message);
        }

        // ⏱️ delay entre imágenes
        await new Promise(r => setTimeout(r, 1200));
      }

      // ⏱️ delay entre usuarios (muy importante)
      await new Promise(r => setTimeout(r, 2000));
    }

    console.log('\n🎉 Envío masivo NQVAwards finalizado con éxito');
  } catch (err) {
    console.error('❌ Error general:', err);
  } finally {
    pool.end();
  }
}

enviarATodos();
