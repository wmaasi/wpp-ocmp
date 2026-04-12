// /cron/sendWeeklyNews.js
require('dotenv').config({ path: __dirname + '/../.env' });

const pool = require('../db');
const fetch = require('node-fetch');
const { registrarLog } = require('../db/queries/logs');
const generarTitularConversado = require('../utils/generarTitularChatGPT');
const { ejecutarEnvio, saludoPorHora, cierreAleatorio } = require('../utils/envioMotor');

// === Utilidades ===
const limpiarLink = (url) => url;
const limpiarComillas = (str) => str.replace(/["'""«»]/g, '').trim();
const normalizar = (str) =>
  str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

const normalizarURL = (url) => {
  if (!url) return "";
  return url
    .replace(/^https?:\/\//, '')
    .split('?')[0]
    .replace(/\/+$/, '')
    .toLowerCase();
};

async function enviarNoticiasDeLaSemana() {
  try {
    console.log('🗓️ Iniciando envío semanal consolidado...\n');

    // === 0. Mensaje especial ===
    const hoy = new Date().toISOString().slice(0, 10);
    const [especialRows] = await pool.query(
      "SELECT mensaje, posicion FROM mensajes_especiales WHERE fecha = ? AND activo = 1 LIMIT 1",
      [hoy]
    );
    const mensajeEspecial = especialRows.length ? especialRows[0] : null;

    // === 1. Notas de la semana ===
    const response = await fetch('https://www.ojoconmipisto.com/wp-json/ocmp/v1/notas-semana');
    const notasPorTema = await response.json();
    const temasDisponibles = Object.keys(notasPorTema);
    console.log("🗂️ Temas esta semana:", temasDisponibles);

    // === 2. Suscriptores ===
    const [suscriptores] = await pool.query(`
      SELECT * FROM suscriptores
      WHERE estado = 'activo'
      AND temas IS NOT NULL
    `);

    if (!suscriptores.length) {
      console.log("⚠️ No hay suscriptores activos.");
      return;
    }

    // === 3. Pre-generar titulares ===
    const titulares = {};
    for (const tema of temasDisponibles) {
      for (const nota of notasPorTema[tema]) {
        const key = normalizarURL(nota.link);
        if (!titulares[key]) {
          if (nota.texto_whatsapp) {
            titulares[key] = limpiarComillas(nota.texto_whatsapp);
          } else {
            const conv = await generarTitularConversado(limpiarComillas(nota.title));
            titulares[key] = limpiarComillas(conv);
          }
        }
      }
    }

    // === 4. Pre-construir mensajes ===
    const subsConContenido = [];

    for (const sub of suscriptores) {
      let listaTemas = [];
      try { listaTemas = JSON.parse(sub.temas); } catch { listaTemas = []; }
      if (!Array.isArray(listaTemas)) listaTemas = [];

      let notasUsuario = [];
      for (const tema of listaTemas) {
        const tn = normalizar(tema);
        for (const t of temasDisponibles) {
          if (normalizar(t) === tn) notasUsuario.push(...notasPorTema[t]);
        }
      }

      notasUsuario = Object.values(
        notasUsuario.reduce((acc, n) => {
          acc[normalizarURL(n.link)] = n;
          return acc;
        }, {})
      );

      if (notasUsuario.length === 0 && !mensajeEspecial) continue;

      const nombre = sub.nombre?.split(' ')[0] || '';
      const saludo = saludoPorHora();
      let mensaje = `🧵 *Resumen semanal*\n\n${saludo} *${nombre}*, aquí te dejamos lo más relevante de la semana 👇\n\n`;

      if (mensajeEspecial && mensajeEspecial.posicion === 'inicio') {
        mensaje += `${mensajeEspecial.mensaje}\n\n`;
      }

      if (notasUsuario.length > 0) {
        mensaje += `📌 Estas son las noticias semanales relacionadas con tus temas:\n\n`;
        for (const nota of notasUsuario) {
          const key = normalizarURL(nota.link);
          mensaje += `• ${titulares[key]}\n${limpiarLink(nota.link)}\n\n`;
        }
        mensaje += `📅 Publicadas en los últimos 7 días.\n`;
      }

      if (mensajeEspecial && mensajeEspecial.posicion === 'final') {
        mensaje += `\n${mensajeEspecial.mensaje}\n`;
      }

      mensaje += `\n${cierreAleatorio()}`;
      subsConContenido.push({ ...sub, _mensaje: mensaje });
    }

    console.log(`📨 Suscriptores con contenido: ${subsConContenido.length}`);

    // === 5. Ejecutar envío con el motor ===
    const { enviados, errores, fallidos } = await ejecutarEnvio(
      subsConContenido,
      async (sub) => sub._mensaje,
      {},
      {
        registrarLog,
        adminNumber: process.env.ADMIN_NUMBER,
        etiqueta: 'envio_semanal',
      }
    );

    // === 6. Resumen al admin ===
    const resumen = `
🟢 *Envío semanal completado*
📨 Enviados: ${enviados}
❌ Errores: ${errores}
🔴 Fallidos definitivos: ${fallidos.length}
🕒 ${new Date().toLocaleString('es-GT')}
`;
    try {
      const sendMessage = require('../bot/sendMessage');
      await sendMessage(process.env.ADMIN_NUMBER, resumen);
      await registrarLog(process.env.ADMIN_NUMBER, resumen, 'resumen_envio_semanal');
    } catch (err) {
      console.warn("⚠️ No se pudo enviar resumen al admin:", err.message);
    }

    console.log("\n🟢 Finalizado.");

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