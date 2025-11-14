// /cron/sendDailyNews_test.js
require('dotenv').config({ path: __dirname + '/../.env' });

const pool = require('../db');
const fetch = require('node-fetch');
const sendMessage = require('../bot/sendMessage');
const getOjoAlDato = require('../utils/getOjoAlDato');

// === Limpiar https:// ===
const limpiarLink = (url) => url.replace(/^https?:\/\//, '');

async function enviarNoticiasTest() {
  try {
    console.log('🧪 Iniciando prueba de envío único (solo a William)...');

    const MI_NUMERO = "50255629247"; // <-- CAMBIAR AQUÍ
    const MI_NOMBRE = "William";

    // Forzar departamentos de prueba
    const deptosPrueba = ["Guatemala", "Escuintla", "Sacatepéquez"];

    // === 1. Obtener notas del día desde WordPress ===
    const response = await fetch('https://www.ojoconmipisto.com/wp-json/ocmp/v1/notas-hoy');
    const notasPorDepto = await response.json();

    console.log("📄 Departamentos detectados hoy:", Object.keys(notasPorDepto));

    // === 2. Obtener notas relevantes para tu prueba ===
    let notasUsuario = [];
    const normalizar = (str) => str.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

    for (const d of deptosPrueba) {
      for (const k of Object.keys(notasPorDepto)) {
        if (normalizar(k) === normalizar(d)) {
          notasUsuario.push(...notasPorDepto[k]);
        }
      }
    }

    // === 3. Quitar duplicados ===
    const unicos = {};
    for (const n of notasUsuario) unicos[n.link] = n;
    notasUsuario = Object.values(unicos);

    console.log(`📰 Notas encontradas para prueba: ${notasUsuario.length}`);

    // === 4. Obtener OjoAlDato de Guatemala (prueba más estable) ===
    let ojoDato = await getOjoAlDato("Guatemala");
    if (ojoDato) {
      ojoDato = ojoDato.replace(/^#?OjoAlDato\s*[-–—:]?\s*/i, '');
    }

    // === 5. Crear mensaje ===
    const frasesIntro = [
      'Mientras que [TITULAR],',
      'Te contamos que [TITULAR],',
      'Te sacamos de la duda [TITULAR],',
      '¿Ya te enteraste que [TITULAR]?',
      'Esto pasó hoy: [TITULAR]',
      'Por si no sabías [TITULAR]',
      '¿Viste que [TITULAR]?',
    ];

    let mensaje = `🧪 *PRUEBA DE ENVÍO DIARIO*\nHola ${MI_NOMBRE}, este mensaje solo es para pruebas.\n\n`;

    if (notasUsuario.length > 0) {
      mensaje += `📌 Noticias detectadas:\n\n`;

      mensaje += notasUsuario.map(nota => {
        const frase = frasesIntro[Math.floor(Math.random() * frasesIntro.length)];
        const apertura = frase.replace('[TITULAR]', nota.title);
        return `• ${apertura}\n${limpiarLink(nota.link)}`;
      }).join('\n\n');
    } else {
      mensaje += `Hoy no hubo notas para tus departamentos de prueba.\n\n`;
    }

    if (ojoDato) {
      mensaje += `\n\n📊 *#OjoAlDato*\n${ojoDato}`;
    }

    console.log("\n📤 Enviando mensaje de prueba a:", MI_NUMERO);

    // === 6. Enviar solo a tu número ===
    await sendMessage(MI_NUMERO, mensaje);

    console.log("✅ Mensaje enviado exitosamente a tu WhatsApp.");

    await pool.end();

  } catch (error) {
    console.error("❌ Error en prueba:", error.message);
    try { await pool.end(); } catch {}
  }
}

module.exports = enviarNoticiasTest;

if (require.main === module) {
  enviarNoticiasTest()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}
