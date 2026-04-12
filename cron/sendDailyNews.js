// /cron/sendDailyNews.js
require('dotenv').config({ path: __dirname + '/../.env' });

const pool = require('../db');
const fetch = require('node-fetch');
const { registrarLog } = require('../db/queries/logs');
const getOjoAlDato = require('../utils/getOjoAlDato');
const generarTitularConversado = require('../utils/generarTitularChatGPT');
const { ejecutarEnvio, saludoPorHora, cierreAleatorio } = require('../utils/envioMotor');

// === Utilidades ===
const limpiarLink = (url) => url;
const limpiarComillas = (str) => str.replace(/["'""«»]/g, '').trim();
const normalizar = (str) =>
  str.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

async function enviarNoticiasDelDia() {
  try {
    console.log('🕓 Iniciando envío automático de noticias diarias...\n');

    // === 0. Mensaje especial ===
    const hoy = new Date().toISOString().slice(0, 10);
    const [especialRows] = await pool.query(
      "SELECT mensaje, posicion FROM mensajes_especiales WHERE fecha = ? LIMIT 1",
      [hoy]
    );
    const mensajeEspecial = especialRows.length ? especialRows[0] : null;

    // === 1. Notas del día ===
    const response = await fetch('https://www.ojoconmipisto.com/wp-json/ocmp/v1/notas-hoy');
    const notasPorDepto = await response.json();
    const departamentosConNotas = Object.keys(notasPorDepto);
    console.log('🗂️ Departamentos con notas hoy:', departamentosConNotas);

    // === 2. OjoAlDato ===
    const ojo = await getOjoAlDato();
    if (!ojo) console.log("⚠️ OjoAlDato no disponible hoy");
    else console.log("📊 OjoAlDato cargado:", ojo);

    // === 3. Suscriptores ===
    const [suscriptores] = await pool.query(`
      SELECT * FROM suscriptores
      WHERE estado = 'activo'
      AND departamento IS NOT NULL
    `);

    if (!suscriptores.length) {
      console.log('⚠️ No hay suscriptores activos.');
      return;
    }

    console.log(`👥 Suscriptores activos: ${suscriptores.length}`);

    // === 4. Pre-generar titulares ===
    const titulares = {};
    for (const depto of departamentosConNotas) {
      for (const nota of notasPorDepto[depto]) {
        if (!titulares[nota.link]) {
          if (nota.texto_whatsapp) {
            titulares[nota.link] = limpiarComillas(nota.texto_whatsapp);
          } else {
            const conv = await generarTitularConversado(limpiarComillas(nota.title));
            titulares[nota.link] = limpiarComillas(conv);
          }
        }
      }
    }

    // === 5. Función de construcción de mensaje por suscriptor ===
    async function construirMensaje(sub) {
      let deptos = [];
      try { deptos = JSON.parse(sub.departamento); } catch { deptos = []; }
      if (!Array.isArray(deptos)) deptos = [];

      // Filtrar notas del usuario
      let notasUsuario = [];
      for (const d of deptos) {
        const nd = normalizar(d);
        for (const k of departamentosConNotas) {
          if (normalizar(k) === nd) notasUsuario.push(...notasPorDepto[k]);
        }
      }
      notasUsuario = Object.values(
        notasUsuario.reduce((acc, n) => (acc[n.link] = n, acc), {})
      );

      // OjoAlDato aplica?
      let incluirOjo = false;
      if (ojo && ojo.departamento) {
        const ojoDeptNorm = normalizar(ojo.departamento);
        incluirOjo = deptos.map(d => normalizar(d)).includes(ojoDeptNorm);
      }

      if (notasUsuario.length === 0 && !incluirOjo && !mensajeEspecial) {
        return null; // sin contenido, no enviar
      }

      const nombre = sub.nombre?.split(' ')[0] || '';
      const saludo = saludoPorHora();
      let mensaje = `${saludo} *${nombre}* 👋 Te traigo el resumen del día.\n\n`;

      if (mensajeEspecial && mensajeEspecial.posicion === 'inicio') {
        mensaje += `${mensajeEspecial.mensaje}\n\n`;
      }

      if (notasUsuario.length > 0) {
        mensaje += `📌 Estas son tus noticias de hoy:\n\n`;
        for (const nota of notasUsuario) {
          mensaje += `• ${titulares[nota.link]}\n${limpiarLink(nota.link)}\n\n`;
        }
      }

      if (incluirOjo) {
        mensaje += `📊 *#OjoAlDato (${ojo.departamento})*\n${ojo.texto}\n\n`;
      }

      if (mensajeEspecial && mensajeEspecial.posicion === 'final') {
        mensaje += `\n${mensajeEspecial.mensaje}\n`;
      }

      mensaje += `\n${cierreAleatorio()}`;
      return mensaje;
    }

    // === 6. Filtrar suscriptores con contenido ===
    const subsConContenido = [];
    for (const sub of suscriptores) {
      const msg = await construirMensaje(sub);
      if (msg) subsConContenido.push({ ...sub, _mensaje: msg });
    }

    console.log(`📨 Suscriptores con contenido relevante: ${subsConContenido.length}`);

    // === 7. Ejecutar envío con el motor ===
    const { enviados, errores, fallidos } = await ejecutarEnvio(
      subsConContenido,
      async (sub) => sub._mensaje,
      {},
      {
        registrarLog,
        adminNumber: process.env.ADMIN_NUMBER,
        etiqueta: 'envio_diario',
      }
    );

    // === 8. Resumen al admin ===
    const resumen = `
🟢 *Envío diario completado*
✅ Enviados: ${enviados}
❌ Errores: ${errores}
🔴 Fallidos definitivos: ${fallidos.length}
📊 OjoAlDato: ${ojo ? ojo.departamento : 'No disponible'}
🕒 ${new Date().toLocaleString('es-GT')}
`;
    try {
      const sendMessage = require('../bot/sendMessage');
      await sendMessage(process.env.ADMIN_NUMBER, resumen);
      await registrarLog(process.env.ADMIN_NUMBER, resumen, 'resumen_envio');
    } catch (e) {
      console.warn("⚠️ No se pudo enviar resumen al admin:", e.message);
    }

    console.log('🟢 Finalizado.');

  } catch (err) {
    console.error("❌ Error global:", err.message);
  }
}

module.exports = enviarNoticiasDelDia;

if (require.main === module) {
  enviarNoticiasDelDia()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}