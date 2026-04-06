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
  str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

// Normalizador avanzado de enlaces
const normalizarURL = (url) => {
  if (!url) return "";
  return url
    .replace(/^https?:\/\//, '')   // quitar https://
    .split('?')[0]                 // quitar parámetros
    .replace(/\/+$/, '')           // quitar slash final
    .toLowerCase();
};

async function enviarNoticiasDeLaSemana() {
  try {
    console.log('🗓️ Iniciando envío semanal consolidado...\n');

    // 🆕 === 0. Leer mensaje especial ===
    const hoy = new Date().toISOString().slice(0, 10);
    const [especialRows] = await pool.query(
      "SELECT mensaje, posicion FROM mensajes_especiales WHERE fecha = ? AND activo = 1 LIMIT 1",
      [hoy]
    );
    const mensajeEspecial = especialRows.length ? especialRows[0] : null;

    // === 1. Obtener notas de la semana ===
    const response = await fetch('https://www.ojoconmipisto.com/wp-json/ocmp/v1/notas-semana');
    const notasPorTema = await response.json();
    const temasDisponibles = Object.keys(notasPorTema);

    console.log("🗂️ Temas esta semana:", temasDisponibles);

    // === 2. Obtener suscriptores activos ===
    const [suscriptores] = await pool.query(`
      SELECT * FROM suscriptores
      WHERE estado = 'activo'
      AND temas IS NOT NULL
    `);

    if (!suscriptores.length) {
      console.log("⚠️ No hay suscriptores activos.");
      return;
    }

    // === 3. Pre-generar titulares GPT ===
    const titularesGPTCache = {};

    for (const tema of temasDisponibles) {
      for (const nota of notasPorTema[tema]) {
        const key = normalizarURL(nota.link);
        if (!titularesGPTCache[key]) {
          let conv = await generarTitularConversado(limpiarComillas(nota.title));
          titularesGPTCache[key] = limpiarComillas(conv);
        }
      }
    }

    let totalEnviados = 0;
    let totalErrores = 0;

    // === 4. Enviar resumen consolidado por usuario ===
    for (const sub of suscriptores) {
      let listaTemas = [];
      try { listaTemas = JSON.parse(sub.temas); } catch { listaTemas = []; }
      if (!Array.isArray(listaTemas)) listaTemas = [];

      let notasUsuario = [];

      // Obtener todas las notas de los temas del usuario
      for (const tema of listaTemas) {
        const tn = normalizar(tema);

        for (const t of temasDisponibles) {
          if (normalizar(t) === tn) {
            notasUsuario.push(...notasPorTema[t]);
          }
        }
      }

      if (notasUsuario.length === 0 && !mensajeEspecial) {
        console.log(`⚠️ ${sub.telefono}: sin contenido → no se envía.`);
        continue;
      }

      // Quitar duplicados normalizando URL
      notasUsuario = Object.values(
        notasUsuario.reduce((acc, n) => {
          acc[normalizarURL(n.link)] = n;
          return acc;
        }, {})
      );

      const nombre = sub.nombre?.split(' ')[0] || '';
      let mensaje = `🧵 *Resumen semanal*\n\nHola ${nombre}, aquí te dejamos lo más relevante de la semana 👇\n\n`;

      // ——— MENSAJE ESPECIAL AL INICIO ———
      if (mensajeEspecial && mensajeEspecial.posicion === 'inicio') {
        mensaje += `${mensajeEspecial.mensaje}\n\n`;
      }

      // ——— NOTICIAS ———
      if (notasUsuario.length > 0) {
      mensaje += `📌 Estas son las noticias semanales relacionadas con tus temas:\n\n`;

         for (const nota of notasUsuario) {
           const key = normalizarURL(nota.link);
           const titularGPT = titularesGPTCache[key];

           mensaje += `• ${titularGPT}\n${limpiarLink(key)}\n\n`;
         }

         mensaje += `📅 Publicadas en los últimos 7 días.\n`;
      }

      // ——— MENSAJE ESPECIAL AL FINAL ———
      if (mensajeEspecial && mensajeEspecial.posicion === 'final') {
        mensaje += `\n${mensajeEspecial.mensaje}\n`;
      }

      // ——— Enviar ———
      try {
        await sendMessage(sub.telefono, mensaje);
        await registrarLog(sub.telefono, mensaje, 'envio_semanal');
        totalEnviados++;
        console.log(`✅ Enviado a ${sub.telefono}`);
      } catch (err) {
        await registrarLog(sub.telefono, mensaje + "\n[ERROR] " + err.message, 'error');
        totalErrores++;
        console.error(`❌ Error enviando a ${sub.telefono}:`, err.message);
      }
    }

    // === 5. Resumen para admin ===
    const admin = process.env.ADMIN_NUMBER || '502XXXXXXXX';
    const resumen = `
🟢 *Envío semanal completado*
📨 Envíos realizados: ${totalEnviados}
❌ Errores: ${totalErrores}
🕒 ${new Date().toLocaleString('es-GT')}
`;

    try {
      await sendMessage(admin, resumen);
      await registrarLog(admin, resumen, 'resumen_envio_semanal');
    } catch (err) {
      console.error("⚠️ No se pudo enviar resumen al admin:", err.message);
    }

    console.log('🟢 Finalizado.');

  } catch (err) {
    console.error("❌ Error global semanal:", err);
  }
}

module.exports = enviarNoticiasDeLaSemana;

if (require.main === module) {
  enviarNoticiasDeLaSemana()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}
