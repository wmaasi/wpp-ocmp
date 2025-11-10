require('dotenv').config({ path: __dirname + '/../.env' });
const pool = require('../db');
const fetch = require('node-fetch');

// 🔗 Endpoint local del bot
const API_URL = 'http://localhost:3001/send-file';

// 🖼️ Imagen y texto
const imagePath = '/home/william_maas/wpp-ocmp/images/pov-edgar-ortiz.jpg';
const message = `🎙️ *Hoy a las 6:30 PM*  
Conoceremos el #POV de *Edgar Ortiz* sobre los impactos y alcances del *Decreto 7-2025*, que permitirá el uso multianual de algunos fondos de los #Codede.  

💡 Descubre por qué ahora es todavía más importante *fiscalizarlos*. 🔍👀  

👉 *Activa tu recordatorio aquí:*  
https://f.mtr.cool/ardbgdctjw`;

async function enviarPOV() {
  try {
    const [suscriptores] = await pool.query("SELECT telefono FROM suscriptores WHERE estado='activo'");
    console.log(`📱 Enviando mensaje con imagen a ${suscriptores.length} suscriptores...\n`);

    for (const s of suscriptores) {
      const payload = {
        number: s.telefono,
        filePath: imagePath,
        filename: 'pov-edgar-ortiz.jpg',
        caption: message,
      };

      try {
        const res = await fetch(API_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

        // Intenta leer la respuesta como JSON o texto para evitar el error "<"
        const text = await res.text();
        let data;
        try {
          data = JSON.parse(text);
        } catch {
          console.error(`⚠️ Respuesta inesperada del servidor para ${s.telefono}:\n${text}`);
          continue;
        }

        if (data.result === 'success') {
          console.log(`✅ Enviado a ${s.telefono}`);
        } else {
          console.warn(`⚠️ Error al enviar a ${s.telefono}:`, data);
        }
      } catch (error) {
        console.error(`❌ Error de red al enviar a ${s.telefono}:`, error.message);
      }

      await new Promise(r => setTimeout(r, 1000)); // delay entre envíos
    }

    console.log('\n🎉 Envío masivo finalizado.');
  } catch (error) {
    console.error('❌ Error general en el envío:', error);
  } finally {
    pool.end();
  }
}

enviarPOV();