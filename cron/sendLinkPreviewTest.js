// scripts/sendLinkPreviewTest.js
require('dotenv').config({ path: __dirname + '/../.env' });

const sendMessage = require('../bot/sendMessage');

async function ejecutarPrueba() {
  const numero = '50253460168'; // número de prueba

  console.log('📤 Enviando prueba A (enlace normal)...');
  await sendMessage(numero, 'Prueba A:\nhttps://www.ojoconmipisto.com/trafico-por-juego-de-la-seleccion-pmt-desplegara-100-agentes-en-estadio-el-trebol/');

  console.log('📤 Enviando prueba B (sin https://)...');
  await sendMessage(numero, 'Prueba B:\nwww.ojoconmipisto.com/trafico-por-juego-de-la-seleccion-pmt-desplegara-100-agentes-en-estadio-el-trebol/');

  console.log('📤 Enviando prueba C (con punto entre corchetes)...');
  await sendMessage(numero, 'Prueba C:\nhttps://www.ojoconmipisto[.]com/trafico-por-juego-de-la-seleccion-pmt-desplegara-100-agentes-en-estadio-el-trebol/');

  console.log('✅ Pruebas enviadas, revisa tu WhatsApp.');
}

ejecutarPrueba();
