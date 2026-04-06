require('dotenv').config({ path: __dirname + '/../.env' });
const fetch = require('node-fetch');

const API_URL = 'http://localhost:3001/send-image';
const myNumber = '50255629247';

const imagePath = '/home/william_maas/wpp-ocmp/uploads/test.jpeg';

const message = `¡Llega la primera #GuíaParaVecinos🤓 del año!🚀
Este miércoles 21 de enero aprende sobre los presupuestos municipales y el situado constitucional con el que cuentan las alcaldías para 2026, con Erick Coyoy, coordinador de @ASIES_GT. ¡Inscríbete aquí!⚡️👇
https://bit.ly/GuiaParaVecinosOjoconmipisto`;

async function enviarPrueba() {
  console.log(`📤 Enviando prueba con imagen a ${myNumber}...\n`);

  try {
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        to: myNumber,
        imagePath,
        caption: message,
      }),
    });

    const data = await res.json();
    console.log('✅ Respuesta:', data);
  } catch (err) {
    console.error('❌ Error:', err.message);
  }
}

enviarPrueba();
