require('dotenv').config({ path: __dirname + '/../.env' });
const fetch = require('node-fetch');

// 🔗 Endpoint local del bot
const API_URL = 'http://localhost:3001/send-file';

// 🔢 Tu número (reemplaza con el tuyo)
const myNumber = '50255629247'; // ← tu número completo sin "+"

// 🖼️ Imagen y texto
const imagePath = '/home/william_maas/wpp-ocmp/images/pov-edgar-ortiz.jpg';
const message = `🎙️ *Hoy a las 6:30 PM*  
Conoceremos el #POV de *Edgar Ortiz* sobre los impactos y alcances del *Decreto 7-2025*, que permitirá el uso multianual de algunos fondos de los #Codede*.  

💡 Descubre por qué ahora es todavía más importante *fiscalizarlos*. 🔍👀  

👉 *Activa tu recordatorio aquí:*  
https://f.mtr.cool/ardbgdctjw`;

async function enviarPrueba() {
  const payload = {
    number: myNumber,
    filePath: imagePath,
    filename: 'pov-edgar-ortiz.jpg',
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