// /cron/sendWeeklyNews_test.js
require('dotenv').config({ path: __dirname + '/../.env' });

const pool = require('../db');
const fetch = require('node-fetch');
const sendMessage = require('../bot/sendMessage');
const generarTitularConversado = require('../utils/generarTitularChatGPT');

// === Utilidades ===
const limpiarLink = (url) => url.replace(/^https?:\/\//, '');
const limpiarComillas = (str) => str.replace(/["'“”«»]/g, '').trim();
const normalizar = (str) =>
  str.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

async function enviarWeeklyNewsTest() {
  try {
    console.log("🧪 Iniciando prueba semanal + mensaje especial...");

    const MI_NUMERO = "50255629247";
    const MI_NOMBRE = "William";

    const temasPrueba = ["Movilidad", "Ambiente", "Consejos de Desarrollo"];

    // 🆕 === 0. Cargar mensaje especial EXACTAMENTE como sendDailyNews.js ===
    const hoy = new Date().toISOString().slice(0, 10);
    const [especialRows] = await pool.query(
      "SELECT mensaje, posicion FROM mensajes_especiales WHERE fecha = ? LIMIT 1",
      [hoy]
    );
    const mensajeEspecial = especialRows.length ? especialRows[0] : null;

    // === 1. Obtener notas de la semana ===
    const response = await fetch("https://www.ojoconmipisto.com/wp-json/ocmp/v1/notas-semana");
    const notasPorTema = await response.json();

    const temasDisponibles = Object.keys(notasPorTema);
    console.log("🗂️ Temas disponibles esta semana:", temasDisponibles);

    // === 2. Recopilar notas del usuario ===
    let notasUsuario = [];

    for (const tema of temasPrueba) {
      const tn = normalizar(tema);

      for (const t of temasDisponibles) {
        if (normalizar(t) === tn) {
          notasUsuario.push(...notasPorTema[t]);
        }
      }
    }

    // Quitar duplicados
    notasUsuario = Object.values(
      notasUsuario.reduce((acc, n) => {
        acc[limpiarLink(n.link)] = n;
        return acc;
      }, {})
    );

    console.log(`📊 Notas encontradas: ${notasUsuario.length}`);

    if (notasUsuario.length === 0 && !mensajeEspecial) {
      console.log("🚫 No hay contenido para enviar.");
      await pool.end();
      return;
    }

    // === 3. Titulares GPT ===
    const titularesGPT = {};

    for (const nota of notasUsuario) {
      const key = limpiarLink(nota.link);
      if (!titularesGPT[key]) {
        let conv = await generarTitularConversado(limpiarComillas(nota.title));
        titularesGPT[key] = limpiarComillas(conv);
      }
    }

    // === 4. Construir mensaje ===
    let mensaje = `🧪 *PRUEBA RESUMEN SEMANAL + GPT*\nHola ${MI_NOMBRE}!\n\n`;

    // 🆕 === MENSAJE ESPECIAL AL INICIO ===
    if (mensajeEspecial && mensajeEspecial.posicion === "inicio") {
      mensaje += `${mensajeEspecial.mensaje}\n\n`;
    }

    // === Notas ===
    if (notasUsuario.length > 0) {
      mensaje += `📌 Estas son las noticias semanales relacionadas con tus temas:\n\n`;

      for (const nota of notasUsuario) {
        const key = limpiarLink(nota.link);
        mensaje += `• ${titularesGPT[key]}\n${key}\n\n`;
      }
    }

    mensaje += `📅 Publicadas en los últimos 7 días.\n`;

    // 🆕 === MENSAJE ESPECIAL AL FINAL ===
    if (mensajeEspecial && mensajeEspecial.posicion === "final") {
      mensaje += `\n${mensajeEspecial.mensaje}\n`;
    }

    // === 5. Enviar ===
    console.log("📤 Enviando mensaje...");
    await sendMessage(MI_NUMERO, mensaje);

    console.log("✅ Prueba semanal enviada con éxito.");
    await pool.end();

  } catch (err) {
    console.error("❌ Error semanal:", err.message);
    try { await pool.end(); } catch {}
  }
}

module.exports = enviarWeeklyNewsTest;

if (require.main === module) {
  enviarWeeklyNewsTest()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}
