const fetch = require('node-fetch');
const { getClient } = require('../bot'); // seguimos usando el cliente si está local

async function sendMessage(numero, mensaje) {
  const client = getClient();

  // 🔹 Si hay cliente local (bot.js ejecutándose en el mismo proceso)
  if (client) {
    try {
      await client.sendText(`${numero}@c.us`, mensaje);
      console.log(`✅ Mensaje enviado localmente a ${numero}`);
      return;
    } catch (err) {
      console.error(`❌ Error local al enviar a ${numero}:`, err.message);
    }
  }

  // 🔹 Si no hay cliente local (por ejemplo, cuando lo ejecuta el cron)
  try {
    console.log('📡 Enviando mensaje vía API local del bot...');
    const response = await fetch('http://localhost:3001/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to: numero, msg: mensaje }),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status} ${await response.text()}`);
    }

    console.log(`✅ Mensaje enviado a ${numero} vía bot activo`);
  } catch (err) {
    console.error(`❌ Error al enviar mensaje vía API local:`, err.message);
    throw err;
  }
}

module.exports = sendMessage;
