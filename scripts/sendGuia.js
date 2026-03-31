require('dotenv').config({ path: __dirname + '/../.env' });
const { getClient } = require('../bot');

// 🔢 Tu número (sin +)
const myNumber = '50255629247';

// 🖼️ Imagen y texto
const imagePath = '/home/william_maas/wpp-ocmp/uploads/guia.jpeg';

const message = `¡Llega la última #GuíaParaVecinos🤓 del año!
Aprende sobre el portal del Sistema Nacional de Inversión Pública (SNIP) con Sofía Menchú.

Conoce cómo fiscalizar el gasto público municipal💰 y los proyectos en desarrollo para tu comunidad.

¡Inscríbete aquí!👇
https://f.mtr.cool/feplvvvexh`;

async function enviarPrueba() {
  const client = getClient();

  if (!client) {
    console.error('❌ No hay cliente activo de WPPConnect. ¿Está corriendo bot.js?');
    process.exit(1);
  }

  console.log(`📤 Enviando mensaje de prueba a ${myNumber}...\n`);

  try {
    await client.sendImage(
      `${myNumber}@c.us`,
      imagePath,
      'guia.jpeg',
      message
    );

    console.log(`✅ Imagen enviada correctamente a ${myNumber}`);
  } catch (error) {
    console.error('❌ Error al enviar imagen:', error.message);
  } finally {
    process.exit(0);
  }
}

enviarPrueba();
