const { getClient } = require('../bot');

async function sendImageMessage(numero, imagePath, caption) {
  const client = getClient();

  if (!client) {
    throw new Error('❌ No hay cliente activo de WPPConnect');
  }

  try {
    await client.sendImage(
      `${numero}@c.us`,
      imagePath,
      'guia.jpeg',
      caption
    );

    console.log(`✅ Imagen enviada a ${numero}`);
  } catch (err) {
    console.error(`❌ Error al enviar imagen a ${numero}:`, err.message);
    throw err;
  }
}

module.exports = sendImageMessage;
