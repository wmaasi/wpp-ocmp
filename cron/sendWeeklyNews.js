// /cron/sendWeeklyNews.js
require('dotenv').config({ path: __dirname + '/../.env' });

const pool = require('../db');
const fetch = require('node-fetch');
const sendMessage = require('../bot/sendMessage');
const { registrarLog } = require('../db/queries/logs');

// === Quitar https:// o http:// para evitar previsualización ===
const limpiarLink = (url) => url.replace(/^https?:\/\//, '');

// === Normalizar texto ===
const normalizar = (str) =>
  str.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

async function enviarNoticiasDeLaSemana() {
  try {
    console.log('🗓️ Iniciando envío semanal (por tema)...');

    // === 1. Obtener notas de la semana ===
    const response = await fetch('https://www.ojoconmipisto.com/wp-json/ocmp/v1/notas-semana');
    const notasPorTema = await response.json();

    const temas = Object.keys(notasPorTema);
    console.log('🗂️ Temas detectados esta semana:', temas.length ? temas : '[]');

    // === 2. Obtener suscriptores activos con temas ===
    const [suscriptores] = await pool.query(`
      SELECT * FROM suscriptores 
      WHERE estado = 'activo'
      AND temas IS NOT NULL
    `);

    if (!suscriptores.length) {
      console.log("⚠️ No hay suscriptores activos con temas.");
      await pool.end();
      return;
    }

    let totalEnviados = 0;
    let totalErrores = 0;

    console.log('\n🚀 Preparando envío semanal...\n');

    const frasesIntro = [
      'Esta semana te contamos que [TITULAR],',
      'En los últimos días se habló de que [TITULAR],',
      'No te pierdas esta nota: [TITULAR],',
      'Durante la semana, [TITULAR].',
      'El Súper investigó y encontró que [TITULAR].',
      'Esta semana, Ojoconmipisto publicó que [TITULAR].'
    ];

    // === 3. Enviar un mensaje por tema por suscriptor ===
    for (const tema of temas) {
      const notasTema = notasPorTema[tema];

      // === 3.1 Quitar duplicados por URL (limpiado) ===
      const normalizarURL = (url) => {
        return limpiarLink(url)
          .split('?')[0]              // sin parámetros
          .replace(/\/+$/, '')        // sin slash final
          .toLowerCase();
      };

      const notasUnicas = {};
      for (const nota of notasTema) {
        notasUnicas[normalizarURL(nota.link)] = nota;
      }
      const notas = Object.values(notasUnicas);

      console.log(`📌 ${tema}: ${notas.length} nota(s) únicas`);

      // === 3.2 Filtrar suscriptores por tema ===
      const suscriptoresPorTema = suscriptores.filter(sub => {
        try {
          const temasSub = JSON.parse(sub.temas);
          if (!Array.isArray(temasSub)) return false;
          return temasSub.some(t => normalizar(t) === normalizar(tema));
        } catch {
          return false;
        }
      });

      if (!suscriptoresPorTema.length) continue;

      // === 3.3 Enviar mensaje a cada suscriptor filtrado ===
      for (const sub of suscriptoresPorTema) {
        const nombre = sub.nombre?.split(' ')[0] || '';

        // Intro del mensaje
        const intro =
          `🌞 ¡Hola ${nombre}! Aquí tienes el resumen de las noticias de la semana sobre *${tema}* 🗞️\n\n`;

        // Cuerpo con notas
        const cuerpo = notas.map(nota => {
          const frase = frasesIntro[Math.floor(Math.random() * frasesIntro.length)];
          const apertura = frase.replace('[TITULAR]', nota.title);
          return `• ${apertura}\n${limpiarLink(nota.link)}`;
        }).join('\n\n');

        const mensaje = `${intro}${cuerpo}\n\n📅 Publicadas en los últimos 7 días.`

        try {
          await sendMessage(sub.telefono, mensaje);
          await registrarLog(sub.telefono, mensaje, 'enviado_semana');
          totalEnviados++;
          console.log(`✅ Enviado a ${sub.telefono}`);
        } catch (error) {
          console.error(`❌ Error enviando a ${sub.telefono}:`, error.message);

          await registrarLog(
            sub.telefono,
            `${mensaje}\n\n[ERROR]: ${error.message}`,
            'error'
          );

          totalErrores++;
        }
      }
    }

    console.log(`\n📊 Resumen semanal: ${totalEnviados} enviados, ${totalErrores} errores.`);
    
    // === 4. Enviar resumen al administrador ===
    const adminNumber = process.env.ADMIN_NUMBER || '502XXXXXXXX';
    const resumen = `
    🟢 *Envío semanal completado*

    📨 *Modo:* envío por temas
    ✅ Enviados: ${totalEnviados}
     ❌ Errores: ${totalErrores}
     🕒 Hora de finalización: ${new Date().toLocaleString('es-GT')}
    `;

try {
  await sendMessage(adminNumber, resumen);
  await registrarLog(adminNumber, resumen, 'resumen_envio_semanal');
  console.log(`📤 Resumen semanal enviado al administrador (${adminNumber})`);
} catch (e) {
  console.error(`⚠️ No se pudo enviar el resumen al administrador:`, e.message);
}
   
    await pool.end();

  } catch (err) {
    console.error('❌ Error global en envío semanal:', err);
    try { await pool.end(); } catch {}
  }
}

module.exports = enviarNoticiasDeLaSemana;

if (require.main === module) {
  enviarNoticiasDeLaSemana()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}
