require('dotenv').config({ path: __dirname + '/../.env' });
const fetch = require('node-fetch');

const API_URL = 'http://localhost:3001/send-image';
const myNumber = '50255629247';

const imagePath = '/home/william_maas/wpp-ocmp/uploads/20minutos260408.jpeg';

const message = `¡Este jueves tenemos #20minutoscon!
🚀 Hablaremos sobre el alza en el precio del transporte 💸 y cómo impacta a quienes dependen del servicio cada día.
Nos acompaña Ronald Peláez, del CEUR-USAC.
🕕 6:00 PM desde las redes de 
@_ojoconmipisto.
¡Participa con tus comentarios! 💬`;

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
