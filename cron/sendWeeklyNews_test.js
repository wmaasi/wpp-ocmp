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
    console.log("🧪 Iniciando prueba semanal con mensaje especial + GPT...\n");

    const MI_NUMERO = "50255629247";
    const MI_NOMBRE = "William";

    const temasPrueba = ["Movilidad", "Ambiente", "Consejos de Desarrollo"];

    // ======================================================
    // === 0. LEER MENSAJE ESPECIAL (instrumentado)       ===
    // ======================================================
    const hoy = new Date().toISOString().slice(0, 10);
    console.log("📅 Fecha (hoy):", hoy);

    const [especialRows] = await pool.query(
      "SELECT id, mensaje, posicion, activo FROM mensajes_especiales WHERE fecha = ? LIMIT 1",
      [hoy]
    );

    console.log("🔎 Resultado del query mensajes_especiales:", especialRows);

    let mensajeEspecial = especialRows.length ? especialRows[0] : null;

    console.log("🔎 mensajeEspecial antes de normalizar:", mensajeEspecial);

    if (mensajeEspecial) {
      mensajeEspecial.mensaje = String(mensajeEspecial.mensaje || "").trim();
      mensajeEspecial.posicion = String(mensajeEspecial.posicion || "").trim();
    }

    console.log("🔎 mensajeEspecial después de normalizar:", mensajeEspecial);
    console.log("\n");

    // ======================================================
    // === 1. Obtener notas de WordPress                  ===
    // ======================================================
    const response = await fetch("https://www.ojoconmipisto.com/wp-json/ocmp/v1/notas-semana");
    const notasPorTema = await response.json();

    const temasDisponibles = Object.keys(notasPorTema);
    console.log("🗂️ Temas disponibles esta semana:", temasDisponibles, "\n");

    // ======================================================
    // === 2. Filtrar notas de prueba                     ===
    // ======================================================
    let notasUsuario = [];

    for (const tema of temasPrueba) {
      const tn = normalizar(tema);

      for (const t of temasDisponibles) {
        if (normalizar(t) === tn) {
          notasUsuario.push(...notasPorTema[t]);
        }
      }
    }

    notasUsuario = Object.values(
      notasUsuario.reduce((acc, n) => {
        acc[limpiarLink(n.link)] = n;
        return acc;
      }, {})
    );

    console.log(`📊 Notas encontradas para prueba: ${notasUsuario.length}\n`);

    // Si no hay contenido y tampoco mensaje especial → no enviar
    if (notasUsuario.length === 0 && !mensajeEspecial) {
      console.log("🚫 No hay contenido para esta prueba.\n");
      await pool.end();
      return;
    }

    // ======================================================
    // === 3. Generar titulares GPT                       ===
    // ======================================================
    const titularesGPT = {};

    for (const nota of notasUsuario) {
      const key = limpiarLink(nota.link);

      if (!titularesGPT[key]) {
        let conv = await generarTitularConversado(limpiarComillas(nota.title));
        titularesGPT[key] = limpiarComillas(conv);
      }
    }

    // ======================================================
    // === 4. Construcción del mensaje                    ===
    // ======================================================
    let mensaje = `🧪 *PRUEBA RESUMEN SEMANAL + GPT*\nHola ${MI_NOMBRE}!\n\n`;

    // --- Log para ver condición antes de decidir ---
    console.log("🛠 Evaluando si se insertará MENSAJE ESPECIAL AL INICIO...");
    console.log("🛠 mensajeEspecial:", mensajeEspecial);

    if (mensajeEspecial) {
      console.log("🛠 posicion.lower:", mensajeEspecial.posicion.toLowerCase());
      console.log("🛠 ¿posición === 'inicio'?:",
        mensajeEspecial.posicion.toLowerCase() === "inicio"
      );
    }

    // === 🆕 MENSAJE ESPECIAL AL INICIO ===
    if (mensajeEspecial && mensajeEspecial.posicion.toLowerCase() === "inicio") {
      console.log("✅ Insertando MENSAJE ESPECIAL en INICIO...\n");
      mensaje += `${mensajeEspecial.mensaje}\n\n`;
    } else {
      console.log("🚫 No se insertó mensaje especial al inicio.\n");
    }

    // === Noticias ===
    if (notasUsuario.length > 0) {
      mensaje += `📌 Estas son las noticias semanales relacionadas con tus temas:\n\n`;

      for (const nota of notasUsuario) {
        const key = limpiarLink(nota.link);
        const titularGPT = titularesGPT[key];

        mensaje += `• ${titularGPT}\n${key}\n\n`;
      }
    }

    mensaje += `📅 Publicadas en los últimos 7 días.\n`;

    // === 🆕 MENSAJE ESPECIAL AL FINAL ===
    console.log("🛠 Evaluando mensaje especial para FINAL...");
    if (mensajeEspecial) {
      console.log("🛠 posicion.lower:", mensajeEspecial.posicion.toLowerCase());
      console.log("🛠 ¿posición === 'final'?:",
        mensajeEspecial.posicion.toLowerCase() === "final"
      );
    }

    if (mensajeEspecial && mensajeEspecial.posicion.toLowerCase() === "final") {
      console.log("✅ Insertando MENSAJE ESPECIAL al FINAL...\n");
      mensaje += `\n${mensajeEspecial.mensaje}\n`;
    } else {
      console.log("🚫 No se insertó mensaje especial al final.\n");
    }

    // ======================================================
    // === 5. Log final                                    ===
    // ======================================================
    console.log("📤 Mensaje FINAL que se enviará:\n");
    console.log("------------------------------------------------------------");
    console.log(mensaje);
    console.log("------------------------------------------------------------\n");

    await sendMessage(MI_NUMERO, mensaje);
    console.log("✅ Mensaje semanal de prueba enviado.\n");

    await pool.end();

  } catch (err) {
    console.error("❌ Error en prueba semanal:", err.message);
    try { await pool.end(); } catch {}
  }
}

module.exports = enviarWeeklyNewsTest;

if (require.main === module) {
  enviarWeeklyNewsTest()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}
