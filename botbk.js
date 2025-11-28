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

    // 🔥 Mantener sesión abierta SIEMPRE
    autoClose: 0,

    // 🔥 Configuración real de Puppeteer (browserArgs NO funciona)
    puppeteerOptions: {
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage'
      ]
    },

    // 🔥 Mostrar QR REAL si WhatsApp invalida sesión
    catchQR: (qrBase64) => {
      console.log('📱 Escanea este QR para conectar tu bot:');
      console.log(qrBase64); // ahora sí muestra el QR real
    },

    logQR: true,
  });

  console.log('✅ Cliente conectado. Escuchando mensajes...');
  require('./bot/listener')(clientInstance);

  // ---------------- API LOCAL -----------------
  const app = express();
  app.use(express.json());

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

  const PORT = 3001;
  app.listen(PORT, () =>
    console.log(`🌐 Bot API local escuchando en http://localhost:${PORT}`)
  );

  return clientInstance;
}

function getClient() {
  return clientInstance;
}

module.exports = { startBot, getClient };

if (require.main === module) {
  startBot();
}
