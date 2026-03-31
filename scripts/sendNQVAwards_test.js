require('dotenv').config({ path: __dirname + '/../.env' });
const fetch = require('node-fetch');

const API_URL = 'http://localhost:3001/send-image';

// 📱 Tu número (sin +)
const myNumber = '50255629247';

// 🖼️ Imágenes a enviar (en orden)
const images = [
  '/home/william_maas/wpp-ocmp/images/imagen06.jpeg',
  '/home/william_maas/wpp-ocmp/images/imagen07.jpeg',
  '/home/william_maas/wpp-ocmp/images/imagen08.jpeg',
  '/home/william_maas/wpp-ocmp/images/imagen09.jpeg',
  '/home/william_maas/wpp-ocmp/images/imagen10.jpeg',
];

// 📝 Mensaje (solo en la primera imagen)
const message = `El listado de ayer de los los #NQVAwards2025 🏆 (Nada Que Ver) está incompleto. Aquí están los otros ganadores. 

Por cierto, ¿tu alcalde debió de ser nominado?`;

async function enviarPrueba() {
  console.log(`📤 Enviando prueba NQVAwards a ${myNumber}...\n`);

  for (let i = 0; i < images.length; i++) {
    try {
      const res = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: myNumber,
          imagePath: images[i],
          caption: i === 0 ? message : '', // texto solo en la primera
        }),
      });

      const data = await res.json();
      console.log(`🖼️ Imagen ${i + 1} enviada:`, data);
    } catch (err) {
      console.error(`❌ Error enviando imagen ${i + 1}:`, err.message);
    }

    // ⏱️ Delay entre imágenes (importante)
    await new Promise(r => setTimeout(r, 1200));
  }

  console.log('\n✅ Prueba completada');
}

enviarPrueba();
