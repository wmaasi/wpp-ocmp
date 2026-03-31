require('dotenv').config({ path: __dirname + '/../.env' });
const fetch = require('node-fetch');

// 🔗 Endpoint local del bot
const API_URL = 'http://localhost:3001/send-image';

// 🔢 Tu número (reemplaza con el tuyo)
const myNumber = '50255629247'; // ← tu número completo sin "+"

// 🖼️ Imagen y texto
const imagePath = '/home/william_maas/wpp-ocmp/images/pov_febrero2.jpeg';
const message = `¿Tienes un proyecto que quisieras que se incluya en el presupuesto💰 de 2027?👀 Este es el momento para solicitar una obra a tu cocode. Y en la #GuíaParaVecinos🤓 del mes, aprenderemos cómo presentarlo con la gobernadora @AngelinaAspuac, inscríbete aquí👇
https://f.mtr.cool/wnsbsegixk`;

async function enviarPrueba() {
  const payload = {
    to: myNumber,
    imagePath: imagePath,
    caption: message,
  };

  console.log(`📤 Enviando mensaje de prueba a ${myNumber}...\n`);

  try {
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const text = await res.text();
    try {
      const data = JSON.parse(text);
      if (data.result === 'success') {
        console.log(`✅ Imagen enviada correctamente a ${myNumber}`);
      } else {
        console.warn(`⚠️ Error del servidor:`, data);
      }
    } catch {
      console.error(`⚠️ Respuesta inesperada del servidor:\n${text}`);
    }
  } catch (error) {
    console.error(`❌ Error de red:`, error.message);
  }
}

enviarPrueba();
