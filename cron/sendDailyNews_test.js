// /cron/sendDailyNews_test.js
require('dotenv').config({ path: __dirname + '/../.env' });

const pool = require('../db');
const fetch = require('node-fetch');
const sendMessage = require('../bot/sendMessage');
const getOjoAlDato = require('../utils/getOjoAlDato');
const generarTitularConversado = require('../utils/generarTitularChatGPT');

// === Utilidades ===
const limpiarLink = (url) => url;
const limpiarComillas = (str) => str.replace(/["'""«»]/g, '').trim();
const normalizar = (str) =>
  str.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

async function enviarDailyNewsTest() {
  try {
    console.log("🧪 Iniciando prueba de envío diario por departamento...\n");

    const MI_NUMERO = "50255629247";
    const MI_NOMBRE = "William";
    const DEPTOS_PRUEBA = ["Huehuetenango"];

    // === 0. Mensaje especial ===
    const hoy = new Date().toISOString().slice(0, 10);
    const [especialRows] = await pool.query(
      "SELECT mensaje, posicion FROM mensajes_especiales WHERE fecha = ? LIMIT 1",
      [hoy]
    );
    const mensajeEspecial = especialRows.length ? especialRows[0] : null;
    console.log("📅 Fecha:", hoy);
    console.log("📢 Mensaje especial:", mensajeEspecial || "ninguno");

    // === 1. Obtener notas del día ===
    const response = await fetch("https://www.ojoconmipisto.com/wp-json/ocmp/v1/notas-hoy");
    const notasPorDepto = await response.json();
    const departamentosConNotas = Object.keys(notasPorDepto);
    console.log("🗂️ Departamentos con notas hoy:", departamentosConNotas, "\n");

    // === 2. OjoAlDato ===
    const ojo = await getOjoAlDato();
    if (ojo) {
      console.log("📊 OjoAlDato:", ojo);
    } else {
      console.log("⚠️ OjoAlDato no disponible hoy");
    }

    // === 3. Pre-generar titulares ===
    const titularesGPTPorNota = {};

    for (const depto of departamentosConNotas) {
      for (const nota of notasPorDepto[depto]) {
        if (!titularesGPTPorNota[nota.link]) {
          if (nota.texto_whatsapp) {
            titularesGPTPorNota[nota.link] = limpiarComillas(nota.texto_whatsapp);
          } else {
            const original = limpiarComillas(nota.title);
            let conversational = await generarTitularConversado(original);
            titularesGPTPorNota[nota.link] = limpiarComillas(conversational);
          }
        }
      }
    }

    // === 4. Filtrar notas por departamento de prueba ===
    let notasUsuario = [];
    for (const d of DEPTOS_PRUEBA) {
      const nd = normalizar(d);
      for (const k of departamentosConNotas) {
        if (normalizar(k) === nd) {
          notasUsuario.push(...notasPorDepto[k]);
        }
      }
    }

    notasUsuario = Object.values(
      notasUsuario.reduce((acc, n) => (acc[n.link] = n, acc), {})
    );

    console.log(`\n📊 Notas encontradas para ${DEPTOS_PRUEBA.join(', ')}: ${notasUsuario.length}`);

    // === 5. OjoAlDato aplica? ===
    let incluirOjo = false;
    if (ojo && ojo.departamento) {
      const ojoDeptNorm = normalizar(ojo.departamento);
      incluirOjo = DEPTOS_PRUEBA.map(d => normalizar(d)).includes(ojoDeptNorm);
    }

    if (notasUsuario.length === 0 && !incluirOjo && !mensajeEspecial) {
      console.log("🚫 Sin contenido para enviar.");
      return;
    }

    // === 6. Construir mensaje ===
    let mensaje = `🌇 ¡Buenas tardes ${MI_NOMBRE}! Te traigo el resumen del día.\n\n`;

    if (mensajeEspecial && mensajeEspecial.posicion === "inicio") {
      mensaje += `${mensajeEspecial.mensaje}\n\n`;
    }

    if (notasUsuario.length > 0) {
      mensaje += `📌 Estas son tus noticias de hoy:\n\n`;
      for (const nota of notasUsuario) {
        const titular = titularesGPTPorNota[nota.link];
        mensaje += `• ${titular}\n${limpiarLink(nota.link)}\n\n`;
      }
    }

    if (incluirOjo) {
      mensaje += `📊 *#OjoAlDato (${ojo.departamento})*\n${ojo.texto}\n\n`;
    }

    if (mensajeEspecial && mensajeEspecial.posicion === "final") {
      mensaje += `\n${mensajeEspecial.mensaje}\n`;
    }

    // === 7. Log y envío ===
    console.log("\n📤 Mensaje a enviar:");
    console.log("------------------------------------------------------------");
    console.log(mensaje);
    console.log("------------------------------------------------------------\n");

    await sendMessage(MI_NUMERO, mensaje);
    console.log("✅ Prueba diaria enviada con éxito.");

  } catch (err) {
    console.error("❌ Error en prueba diaria:", err.message);
  }
}

module.exports = enviarDailyNewsTest;

if (require.main === module) {
  enviarDailyNewsTest()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}
