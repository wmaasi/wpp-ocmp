// /cron/sendWeeklyNews.js
require('dotenv').config({ path: __dirname + '/../.env' });

const pool = require('../db');
const fetch = require('node-fetch');
const sendMessage = require('../bot/sendMessage');
const { registrarLog } = require('../db/queries/logs');
const generarTitularConversado = require('../utils/generarTitularChatGPT');

// === Utilidades ===
const limpiarLink = (url) => url.replace(/^https?:\/\//, '');
const limpiarComillas = (str) => str.replace(/["'“”«»]/g, '').trim();
const normalizar = (str) =>
  str.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

async function enviarNoticiasDeLaSemana() {
  try {
    console.log('🗓️ Iniciando envío semanal (por tema)...');

    // === 1. Obtener notas de la semana ===
    const response = await fetch('https://www.ojoconmipisto.com/wp-json/ocmp/v1/notas-semana');
    const notasPorTema = await response.json();
    const temas = Object.keys(notasPorTema);

    console.log('🗂️ Temas detectados esta semana:', temas);

    // === 2. Obtener suscriptores ===
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

    // ============================================================
    // === 3. PRE-GENERAR TITULARES GPT UNA SOLA VEZ POR NOTA   ===
    // ============================================================
    const titularesGPTCache = {}; // { linkLimpio: titularGPT }

    for (const tema of temas) {
      for (const nota of notasPorTema[tema]) {
        const linkLimpio = limpiarLink(nota.link);
        if (!titularesGPTCache[linkLimpio]) {
          const original = limpiarComillas(nota.title);
          let conversational = await generarTitularConversado(original);
          conversational = limpiarComillas(conversational);
          titularesGPTCache[linkLimpio] = conversational;
        }
      }
    }

    // ============================================================
    // === 4. ENVIAR NOTICIAS TEMA POR TEMA A SUSCRIPTORES     ===
    // ============================================================
    for (const tema of temas) {
      let notasTema = notasPorTema[tema];

      // === 4.1 Normalizar URLs para quitar duplicados ===
      const normalizarURL = (url) => {
        return limpiarLink(url)
          .split('?')[0]      // sin parámetros
          .replace(/\/+$/, '') // sin slash final
          .toLowerCase();
      };

      const unicas = {};
      for (const nota of notasTema) {
        unicas[normalizarURL(nota.link)] = nota;
      }
      notasTema = Object.values(unicas);

      if (!notasTema.length) continue;
      console.log(`📌 Tema: ${tema} → ${notasTema.length} nota(s)`);

      // === 4.2 Filtrar suscriptores que siguen este tema ===
      const suscriptoresPorTema = suscriptores.filter(sub => {
        try {
          const ts = JSON.parse(sub.temas);
          if (!Array.isArray(ts)) return false;
          return ts.some(t => normalizar(t) === normalizar(tema));
        } catch {
          return false;
        }
      });

      if (!suscriptoresPorTema.length) continue;

      // === 4.3 Enviar mensaje a cada suscriptor ===
      for (const sub of suscriptoresPorTema) {
        const nombre = sub.nombre?.split(' ')[0] || '';

        let mensaje = `🌞 ¡Hola ${nombre}! Aquí tienes el resumen de las noticias de la semana sobre *${tema}* 🗞️\n\n`;

        for (const nota of notasTema) {
          const linkLimpio = limpiarLink(nota.link);
          const titularGPT = titularesGPTCache[linkLimpio];

          const intro = frasesIntro[Math.floor(Math.random() * frasesIntro.length)];
          const fraseFinal = intro.replace('[TITULAR]', titularGPT);

          mensaje += `• ${fraseFinal}\n${linkLimpio}\n\n`;
        }

        mensaje += `📅 Publicadas en los últimos 7 días.`

        // === 4.4 Enviar ===
        try {
          await sendMessage(sub.telefono, mensaje);
          await registrarLog(sub.telefono, mensaje, 'enviado_semana');
          totalEnviados++;
          console.log(`✅ Enviado a ${sub.telefono}`);
        } catch (err) {
          await registrarLog(sub.telefono, mensaje + "\n[ERROR]: " + err.message, 'error');
          totalErrores++;
          console.error(`❌ Error enviando a ${sub.telefono}:`, err.message);
        }
      }
    }

    // ============================================================
    // === 5. Resumen para administrador                      ===
    // ============================================================
    const adminNumber = process.env.ADMIN_NUMBER || '502XXXXXXXX';
    const resumen = `
🟢 *Envío semanal completado*
📨 Modo: por temas
✅ Enviados: ${totalEnviados}
❌ Errores: ${totalErrores}
🕒 ${new Date().toLocaleString('es-GT')}
`;

    try {
      await sendMessage(adminNumber, resumen);
      await registrarLog(adminNumber, resumen, 'resumen_envio_semanal');
      console.log(`📤 Resumen enviado al administrador`);
    } catch (e) {
      console.error("⚠️ No se pudo enviar resumen al admin:", e.message);
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
