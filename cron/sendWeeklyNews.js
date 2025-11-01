require('dotenv').config({ path: __dirname + '/../.env' });

const pool = require('../db');
const fetch = require('node-fetch');
const sendMessage = require('../bot/sendMessage');
const { registrarLog } = require('../db/queries/logs');

async function enviarNoticiasDeLaSemana() {
  try {
    console.log('🗓️ Iniciando envío semanal (por tema)...');

    const response = await fetch('https://www.ojoconmipisto.com/wp-json/ocmp/v1/notas-semana');
    const notasPorTema = await response.json();

    const temas = Object.keys(notasPorTema);
    console.log('🗂️ Temas detectados esta semana:', temas.length > 0 ? temas : '[]');

    for (const tema of temas) {
      const notas = notasPorTema[tema];
      console.log(`- ${tema} (${notas.length} nota(s))`);
      for (const nota of notas) {
        console.log(`   📝 ${nota.title}`);
      }
    }

    // Obtener suscriptores activos
    const [suscriptores] = await pool.query(`
      SELECT * FROM suscriptores 
      WHERE estado = 'activo' 
      AND temas IS NOT NULL
    `);

    let totalEnviados = 0;
    let totalErrores = 0;

    console.log('\n🚀 Preparando envío de mensajes semanales...\n');

    const frasesIntro = [
      'Esta semana te contamos que [TITULAR],',
      'En los últimos días se habló de que [TITULAR],',
      'No te pierdas esta nota: [TITULAR],',
      'Durante la semana, [TITULAR].',
      'El Súper investigó y encontró que [TITULAR].',
      'Esta semana, Ojoconmipisto publicó que [TITULAR].'
    ];

    for (const tema of temas) {
      const notas = notasPorTema[tema];

      // Filtrar suscriptores cuyo tema incluye este
      const normalizar = (str) =>
        str.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

      const suscriptoresFiltrados = suscriptores.filter(sub => {
        try {
          const temasSub = JSON.parse(sub.temas);
          if (!Array.isArray(temasSub)) return false;
          return temasSub.some(t => normalizar(t) === normalizar(tema));
        } catch (e) {
          return false;
        }
      });

      if (suscriptoresFiltrados.length === 0) continue;

      console.log(`- ${tema}: ${suscriptoresFiltrados.length} suscriptor(es)`);
      for (const s of suscriptoresFiltrados) {
        console.log(`   📱 ${s.nombre}: ${s.telefono}`);
      }

      // Preparar cuerpo del mensaje
      for (const sub of suscriptoresFiltrados) {
        const nombre = sub.nombre?.split(' ')[0] || '';
        const intro =
          `🌞 ¡Hola ${nombre}! Aquí tienes un resumen de las noticias más relevantes de la semana sobre *${tema}* 🗞️\n\n`;

        const cuerpo = notas.map(nota => {
          const frase = frasesIntro[Math.floor(Math.random() * frasesIntro.length)];
          const apertura = frase.replace('[TITULAR]', nota.title);
          return `• ${apertura}\n${nota.link}`;
        }).join('\n\n');

        const mensaje = `${intro}${cuerpo}\n\n📅 Publicadas en los últimos 7 días.`;

        try {
          await sendMessage(sub.telefono, mensaje);
          await registrarLog(sub.telefono, mensaje, 'enviado');
          totalEnviados++;
        } catch (error) {
          console.error(`❌ Error enviando a ${sub.telefono}:`, error.message);
          await registrarLog(sub.telefono, `${mensaje}\n\n[ERROR]: ${error.message}`, 'error');
          totalErrores++;
        }
      }
    }

    console.log(`\n✅ Envío semanal finalizado: ${totalEnviados} enviados ✅, ${totalErrores} errores ❌.`);
    await pool.end();
  } catch (err) {
    console.error('❌ Error global al enviar noticias semanales:', err);
    try {
      await pool.end();
    } catch (e) {
      console.error('⚠️ Error al cerrar pool:', e);
    }
  }
}

module.exports = enviarNoticiasDeLaSemana;

if (require.main === module) {
  enviarNoticiasDeLaSemana()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}