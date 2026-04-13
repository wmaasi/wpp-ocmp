// bot.js
const wppconnect = require('@wppconnect-team/wppconnect');
const express = require('express');
const fs = require('fs');
require('dotenv').config();

let clientInstance = null;
let isRestarting = false;

const CRASH_LOG = '/home/william_maas/wpp-ocmp/logs/chromium-crash.log';

function logCrash(type, data) {
  const line = `[${new Date().toISOString()}] [${type}] ${data}\n`;
  fs.appendFileSync(CRASH_LOG, line);
  console.log(line.trim());
}

// Limpia locks de Chromium antes de iniciar
function limpiarLocks() {
  const lockFiles = [
    '/home/william_maas/wpp-ocmp/tokens/ocmp-bot/SingletonLock',
    '/home/william_maas/wpp-ocmp/tokens/ocmp-bot/SingletonCookie',
    '/home/william_maas/wpp-ocmp/tokens/ocmp-bot/SingletonSocket',
  ];
  for (const f of lockFiles) {
    try { fs.unlinkSync(f); } catch { }
  }
}

async function startBot() {
  if (clientInstance) return clientInstance;

  limpiarLocks();

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
      '--disable-background-timer-throttling',
      '--disable-backgrounding-occluded-windows',
      '--disable-renderer-backgrounding',
    ],

    puppeteerOptions: {
      args: [
        '--headless=new',
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--disable-background-timer-throttling',
        '--disable-backgrounding-occluded-windows',
        '--disable-renderer-backgrounding',
      ],
    },

    onError: (err) => {
      logCrash('ERROR', err?.message || String(err));
    },

    onBrowser: (browser) => {
      console.log('🧭 Browser iniciado. PID:', browser.process().pid);
      browser.on('disconnected', () => {
        logCrash('BROWSER', 'Chromium desconectado');
        agendarReinicio();
      });
    },

    catchQR: () => console.log('📱 Escanea el QR para conectar el bot.'),
    logQR: true,
  });

  // Monitorear estado de la sesión
  clientInstance.onStateChange((state) => {
    logCrash('STATE', state);
    // Si la sesión se cierra inesperadamente, reiniciar
    if (['CONFLICT', 'UNLAUNCHED', 'UNPAIRED'].includes(state)) {
      logCrash('STATE', `Estado crítico detectado: ${state} — reiniciando`);
      agendarReinicio();
    }
  });

  clientInstance.onStreamChange((state) => {
    logCrash('STREAM', state);
  });

  console.log('✅ Cliente conectado. Escuchando mensajes...');
  require('./bot/listener')(clientInstance);

  // API local para enviar mensajes desde los crons
  const app = express();
  app.use(express.json());

  app.post('/send', async (req, res) => {
    const { to, msg } = req.body;
    const client = getClient();
    if (!client) return res.status(500).send('No hay cliente activo');
    try {
      await client.sendText(`${to}@c.us`, msg);
      res.send('ok');
    } catch (e) {
      console.error('❌ Error al enviar:', e.message);
      res.status(500).send(e.message);
    }
  });

  app.post('/send-image', async (req, res) => {
    const { to, imagePath, caption } = req.body;
    const client = getClient();
    if (!client) return res.status(500).json({ result: 'error', error: 'No client active' });
    try {
      await client.sendImage(`${to}@c.us`, imagePath, 'imagen.jpeg', caption);
      res.json({ result: 'success' });
    } catch (e) {
      console.error('❌ Error al enviar imagen:', e.message);
      res.status(500).json({ result: 'error', error: e.message });
    }
  });

  // Health check — útil para monitoreo externo
  app.get('/health', async (req, res) => {
    try {
      const client = getClient();
      if (!client) return res.status(503).json({ status: 'error', reason: 'no_client' });

      const state = await client.getConnectionState();
      const connected = state === 'CONNECTED';

      res.status(connected ? 200 : 503).json({
        status: connected ? 'ok' : 'disconnected',
        state,
        uptime: process.uptime(),
      });
    } catch (err) {
      res.status(503).json({ status: 'error', reason: err.message });
    }
  });

  const PORT = process.env.BOT_PORT || 3001;
  app.listen(PORT, () => console.log(`🌐 Bot API local en http://localhost:${PORT}`));

  return clientInstance;
}

// Reinicio con delay para evitar loops rápidos
function agendarReinicio(delayMs = 10000) {
  if (isRestarting) return;
  isRestarting = true;
  logCrash('WATCHDOG', `Reinicio programado en ${delayMs / 1000}s`);
  setTimeout(() => {
    logCrash('WATCHDOG', 'Ejecutando reinicio via process.exit(1)');
    process.exit(1); // PM2 se encarga de reiniciar
  }, delayMs);
}

function getClient() {
  return clientInstance;
}

module.exports = { startBot, getClient };

if (require.main === module) {
  startBot().catch((err) => {
    logCrash('FATAL', err.message);
    process.exit(1);
  });
}
