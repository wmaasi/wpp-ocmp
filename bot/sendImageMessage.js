const fetch = require('node-fetch');
const { getClient } = require('../bot');

async function sendImageMessage(numero, imagePath, caption) {
  const client = getClient();

  // Si hay cliente local (mismo proceso que bot.js)
  if (client) {
    try {
      await client.sendImage(`${numero}@c.us`, imagePath, 'imagen.jpeg', caption);
      console.log(`✅ Imagen enviada localmente a ${numero}`);
      return;
    } catch (err) {
      console.error(`❌ Error local al enviar imagen a ${numero}:`, err.message);
    }
  }

  // Fallback a API local del bot
  try {
    console.log('📡 Enviando imagen vía API local del bot...');
    const response = await fetch('http://localhost:3001/send-image', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to: numero, imagePath, caption }),
    });

    const data = await response.json();
    if (data.result !== 'success') {
      throw new Error(data.error || 'Error desconocido');
    }
    console.log(`✅ Imagen enviada a ${numero} vía bot activo`);
  } catch (err) {
    console.error(`❌ Error al enviar imagen vía API local:`, err.message);
    throw err;
  }
}

module.exports = sendImageMessage;