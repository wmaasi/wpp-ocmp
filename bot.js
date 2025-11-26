// bot.js
const wppconnect = require('@wppconnect-team/wppconnect');
require('dotenv').config();
const express = require('express');

let clientInstance = null;

async function startBot() {
  if (clientInstance) return clientInstance;

  clientInstance = await wppconnect.create({
    session: 'ocmp-bot',
    headless: true,
    whatsappVersion: '2.2412.54',
    browserArgs: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    puppeteerOptions: {
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    },
    catchQR: (base64Qrimg) => console.log('📱 Escanea este QR para conectar tu bot.'),
    logQR: true,
  });

  console.log('✅ Cliente conectado. Escuchando mensajes...');
  require('./bot/listener')(clientInstance); // 👈 se pasa el cliente ya inicializado

  // --- 🚀 NUEVO: API local para recibir mensajes desde el cron ---
  const app = express();
  app.use(express.json());

  // Endpoint para enviar mensajes vía el cliente ya activo
  app.post('/send', async (req, res) => {
    const { to, msg } = req.body;
    const client = getClient();

    if (!client) {
      console.error('❌ No hay cliente activo en el bot.');
      return res.status(500).send('No hay cliente activo');
    }

    try {
      await client.sendText(`${to}@c.us`, msg);
      console.log(`✅ Enviado vía API local a ${to}`);
      res.send('ok');
    } catch (e) {
      console.error('❌ Error al enviar vía API local:', e.message);
      res.status(500).send(e.message);
    }
  });

  // Puerto local interno (no expuesto públicamente)
  const PORT = 3001;
  app.listen(PORT, () => console.log(`🌐 Bot API local escuchando en http://localhost:${PORT}`));
  // --- FIN API LOCAL ---

  return clientInstance;
}

function getClient() {
  return clientInstance;
}

module.exports = { startBot, getClient };

// Iniciar automáticamente si se ejecuta directamente
if (require.main === module) {
  startBot();
}
