// bot.js
const wppconnect = require('@wppconnect-team/wppconnect');
require('dotenv').config();

let client;

wppconnect
  .create({
    session: 'ocmp-bot',
    headless: false,
    catchQR: (base64Qrimg) => {
      console.log('📱 Escanea este QR para conectar tu bot.');
    },
    logQR: true
  })
  .then((cli) => {
    client = cli;
    console.log('✅ Cliente conectado. Escuchando mensajes...');
    require('./bot/listener')(client); // 👈 se pasa el cliente ya inicializado
  })
  .catch((err) => console.error('Error al iniciar WPPConnect:', err));

module.exports = { client };
