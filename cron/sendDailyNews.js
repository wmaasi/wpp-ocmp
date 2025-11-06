// /cron/sendDailyNews.js
require('dotenv').config({ path: __dirname + '/../.env' });

const pool = require('../db');
const fetch = require('node-fetch');
const sendMessage = require('../bot/sendMessage');
const { registrarLog } = require('../db/queries/logs');
const getOjoAlDato = require('../utils/getOjoAlDato');

async function enviarNoticiasDelDia() {
  try {
    console.log('🕓 Iniciando envío automático de noticias diarias...\n');

    // === 1. Obtener notas del día desde WordPress ===
    const response = await fetch('https://www.ojoconmipisto.com/wp-json/ocmp/v1/notas-hoy');
    const notasPorDepto = await response.json();

    const departamentos = Object.keys(notasPorDepto);
    console.log('🗂️ Departamentos detectados hoy:', departamentos.length ? departamentos : '[]');

    for (const depto of departamentos) {
      const notas = notasPorDepto[depto];
      console.log(`- ${depto}: ${notas.length} nota(s)`);
      notas.forEach(n => console.log(`   📝 ${n.title}`));
    }

    // === 2. Obtener suscriptores activos ===
    const [suscriptores] = await pool.query(`
      SELECT * FROM suscriptores 
      WHERE estado = 'activo'
      AND departamento IS NOT NULL
    `);

    console.log(`\n👥 Suscriptores activos encontrados: ${suscriptores.length}\n`);
    if (!suscriptores.length) {
      console.log('⚠️ No hay suscriptores activos. Cancelando envío.');
      await pool.end();
      return;
    }

    let totalEnviados = 0;
    let totalErrores = 0;

    const frasesIntro = [
      'Mientras que [TITULAR],',
      'Te contamos que [TITULAR],',
      'Te sacamos de la duda [TITULAR],',
      '¿Ya te enteraste que [TITULAR]?',
      'Esto pasó hoy: [TITULAR]',
      'Por si no sabías [TITULAR]',
      '¿Viste que [TITULAR]?',
    ];

    // === 3. Iterar por cada departamento con notas ===
    for (const depto of departamentos) {
      const notas = notasPorDepto[depto];

      // Normalizador sin acentos
      const normalizar = (str) =>
        str.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

      // Suscriptores filtrados por departamento
      const suscriptoresDepto = suscriptores.filter(sub => {
        try {
          const deptos = JSON.parse(sub.departamento);
          if (!Array.isArray(deptos)) return false;
          return deptos.some(d => normalizar(d) === normalizar(depto));
        } catch {
          return false;
        }
      });

      if (!suscriptoresDepto.length) continue;
      console.log(`📍 ${depto}: ${suscriptoresDepto.length} suscriptor(es)`);

      // === 4. Obtener el #OjoAlDato del departamento ===
      let datoExtra = await getOjoAlDato(depto);
      if (datoExtra) {
        datoExtra = datoExtra.replace(/^#?OjoAlDato\s*[-–—:]?\s*/i, '');
        datoExtra = `📊 #OjoAlDato:\n${datoExtra}`;
      }

      // === 5. Enviar mensaje a cada suscriptor ===
      for (const sub of suscriptoresDepto) {
        const nombre = sub.nombre?.split(' ')[0] || '';
        const intro = `🌇 ¡Buenas tardes ${nombre}! Te traigo las noticias del día para complementar tu regreso a casa.\n\n`;

        const cuerpo = notas.map(nota => {
          const frase = frasesIntro[Math.floor(Math.random() * frasesIntro.length)];
          const apertura = frase.replace('[TITULAR]', nota.title);
          return `• ${apertura}\n${nota.link}`;
        }).join('\n\n');

        const mensaje = `${intro}${cuerpo}\n\n${datoExtra || ''}`;

        try {
          await sendMessage(sub.telefono, mensaje);
          await registrarLog(sub.telefono, mensaje, 'enviado');
          totalEnviados++;
          console.log(`✅ Enviado a ${sub.telefono}`);
        } catch (error) {
          console.error(`❌ Error enviando a ${sub.telefono}:`, error.message);
          await registrarLog(sub.telefono, `${mensaje}\n\n[ERROR]: ${error.message}`, 'error');
          totalErrores++;
        }
      }
    }

    console.log(`\n📊 Resumen del envío diario:`);
    console.log(`✅ ${totalEnviados} enviados correctamente.`);
    console.log(`❌ ${totalErrores} con errores.\n`);

    await pool.end();
    console.log('🟢 Conexión a base de datos cerrada.');

  } catch (err) {
    console.error('❌ Error global al enviar noticias:', err);
    try {
      await pool.end();
    } catch (e) {
      console.error('⚠️ Error al cerrar pool:', e);
    }
  }
}

module.exports = enviarNoticiasDelDia;

if (require.main === module) {
  enviarNoticiasDelDia()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}
