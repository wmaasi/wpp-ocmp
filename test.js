// test-send-active.js
require('dotenv').config();
const { getClient } = require('./bot');

(async () => {
  const client = getClient();
  if (!client) {
    console.error('❌ No hay cliente activo. Asegúrate de que wpp-bot esté ejecutándose con PM2.');
    process.exit(1);
  }

  try {
    await client.sendText('50255629247@c.us', '📢 Prueba (solo para William): mensaje enviado usando la sesión activa del bot.');
    console.log('✅ Mensaje enviado correctamente usando cliente existente.');
  } catch (err) {
    console.error('❌ Error al enviar:', err.message);
  } finally {
    process.exit(0);
  }
})();
