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
    autoClose: false,
    deviceSyncTimeout: 0,
	  
    browserArgs: [
	'--no-sandbox', 
	'--disable-setuid-sandbox', 
	'--disable-dev-shm-usage',
        '--disable-gpu',
        '--disable-background-timer-throttling',  // Evita suspensión por inactividad
        '--disable-backgrounding-occluded-windows',
        '--disable-renderer-backgrounding'
    ],
    
    puppeteerOptions: {
      args: [
        '--headless=new',                     // 🔥 FIX CRÍTICO
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--disable-background-timer-throttling',
        '--disable-backgrounding-occluded-windows',
        '--disable-renderer-backgrounding'
      ]
    },

    onError: (err) => {
	console.error('🔥 ERROR DEL CLIENTE WPPConnect:', err);
    },

    onBrowser: (browser) => {
       console.log('🧭 Browser iniciado. PID:', browser.process().pid);

       browser.on('disconnected', () => {
         console.error('💥 El navegador Chromium se ha desconectado.');
       });
    },

    catchQR: (base64Qrimg) => console.log('📱 Escanea este QR para conectar tu bot.'),
    logQR: true,
  });

  // <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<
// 🔥 LOGGING DE DIAGNÓSTICO AQUÍ MISMO, DESPUÉS DEL CREATE
// ----------------------
const fs = require('fs');
function logCrash(type, data) {
  const line = `[${new Date().toISOString()}] [${type}] ${data}\n`;
  fs.appendFileSync('/home/william_maas/wpp-ocmp/chromium-crash.log', line);
}

clientInstance.onStateChange((state) => {
  logCrash("STATE", state);
});

clientInstance.onStreamChange((state) => {
  logCrash("STREAM", state);
});

clientInstance.onInterfaceChange((state) => {
  logCrash("INTERFACE", state);
});

// >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>

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

// 🖼️ Endpoint para enviar imagen + texto
app.post('/send-image', async (req, res) => {
  const { to, imagePath, caption } = req.body;
  const client = getClient();

  if (!client) {
    console.error('❌ No hay cliente activo para enviar imagen');
    return res.status(500).json({ result: 'error', error: 'No client active' });
  }

  try {
    await client.sendImage(
      `${to}@c.us`,
      imagePath,
      'guia.jpeg',
      caption
    );

    console.log(`🖼️ Imagen enviada a ${to}`);
    res.json({ result: 'success' });
  } catch (e) {
    console.error('❌ Error al enviar imagen:', e.message);
    res.status(500).json({ result: 'error', error: e.message });
  }
});

  // Puerto local interno (no expuesto públicamente)
  const PORT = 3001;
  app.listen(PORT, () => console.log(`🌐 Bot API local escuchando en http://localhost:${PORT}`));
  // --- FIN API LOCAL ---


  // === 🛡️ WATCHDOG: Verifica cada 30 segundos que Chromium siga vivo ===
  setInterval(() => {
    const { exec } = require('child_process');

    exec("ps aux | grep -i 'chromium' | grep -v grep", (err, stdout) => {
      if (!stdout || stdout.trim() === '') {
        console.error('⚠️ WATCHDOG: Chromium NO está en ejecución. Reiniciando bot...');

        // Log para diagnóstico
        const line = `[${new Date().toISOString()}] [WATCHDOG] Chromium muerto, reiniciando bot\n`;
        require('fs').appendFileSync('/home/william_maas/wpp-ocmp/chromium-crash.log', line);

        // Reiniciar proceso actual SIN detener pm2
        process.exit(1);
      }
    });
  }, 30000); // 30 segundos

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
