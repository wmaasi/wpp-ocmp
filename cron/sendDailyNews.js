// /cron/sendDailyNews.js
require('dotenv').config({ path: __dirname + '/../.env' });

const pool = require('../db');
const fetch = require('node-fetch');
const sendMessage = require('../bot/sendMessage');
const { registrarLog } = require('../db/queries/logs');
const getOjoAlDato = require('../utils/getOjoAlDato');
const generarTitularConversado = require('../utils/generarTitularChatGPT');

// === Utilidades ===
const limpiarLink = (url) => url.replace(/^https?:\/\//, '');
const limpiarComillas = (str) => str.replace(/["'“”«»]/g, '').trim();
const normalizar = (str) =>
  str.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

async function enviarNoticiasDelDia() {
  try {
    console.log('🕓 Iniciando envío automático de noticias diarias...\n');

    // 🆕 === 0. Cargar mensaje especial según fecha ===
    const hoy = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    const [especialRows] = await pool.query(
      "SELECT mensaje, posicion FROM mensajes_especiales WHERE fecha = ? LIMIT 1",
      [hoy]
    );
    const mensajeEspecial = especialRows.length ? especialRows[0] : null;

    // === 1. Obtener notas del WP ===
    const response = await fetch('https://www.ojoconmipisto.com/wp-json/ocmp/v1/notas-hoy');
    const notasPorDepto = await response.json();
    const departamentosConNotas = Object.keys(notasPorDepto);
    console.log('🗂️ Departamentos con notas hoy:', departamentosConNotas);

    // === 2. Obtener OjoAlDato ===
    const ojo = await getOjoAlDato();
    if (!ojo || !ojo.departamento || !ojo.texto) {
      console.log("⚠️ OjoAlDato no disponible hoy");
    } else {
      console.log("📊 OjoAlDato cargado:", ojo);
    }

    // === 3. Obtener suscriptores ===
    const [suscriptores] = await pool.query(`
      SELECT * FROM suscriptores 
      WHERE estado = 'activo'
      AND departamento IS NOT NULL
    `);

    if (!suscriptores.length) {
      console.log('⚠️ No hay suscriptores activos.');
      await pool.end();
      return;
    }

    console.log(`👥 Suscriptores activos: ${suscriptores.length}`);

    // === 4. Pre-generar titulares GPT ===
    const titularesGPTPorNota = {};

    for (const depto of departamentosConNotas) {
      for (const nota of notasPorDepto[depto]) {
        if (!titularesGPTPorNota[nota.link]) {
          const original = limpiarComillas(nota.title);
          let conversational = await generarTitularConversado(original);
          conversational = limpiarComillas(conversational);
          titularesGPTPorNota[nota.link] = conversational;
        }
      }
    }

    let totalEnviados = 0;
    let totalErrores = 0;

    // === 5. Recorrer suscriptores ===
    for (const sub of suscriptores) {
      let deptos = [];

      try {
        deptos = JSON.parse(sub.departamento);
      } catch {
        deptos = [];
      }

      if (!Array.isArray(deptos)) deptos = [];

      // === Filtrar notas del usuario ===
      let notasUsuario = [];
      for (const d of deptos) {
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

      // === Determinar si incluye OjoAlDato ===
      let incluirOjo = false;
      if (ojo && ojo.departamento) {
        const ojoDeptNorm = normalizar(ojo.departamento);
        const subDeptNorms = deptos.map(d => normalizar(d));
        incluirOjo = subDeptNorms.includes(ojoDeptNorm);
      }

      // === Si no hay contenido → no enviar ===
      if (notasUsuario.length === 0 && !incluirOjo && !mensajeEspecial) {
        console.log(`⚠️ ${sub.telefono}: sin contenido relevante → no se envía mensaje.`);
        continue;
      }

      // === Construir mensaje ===
      const nombre = sub.nombre?.split(' ')[0] || '';
      let mensaje = `🌇 ¡Buenas tardes ${nombre}! Te traigo el resumen del día.\n\n`;

      // 🆕 === MENSAJE ESPECIAL AL INICIO ===
      if (mensajeEspecial && mensajeEspecial.posicion === "inicio") {
        mensaje += `${mensajeEspecial.mensaje}\n\n`;
      }

      // === Noticias ===
      if (notasUsuario.length > 0) {
        mensaje += `📌 Estas son tus noticias de hoy:\n\n`;

        for (const nota of notasUsuario) {
          const titularGPT = titularesGPTPorNota[nota.link];
          mensaje += `• ${titularGPT}\n${limpiarLink(nota.link)}\n\n`;
        }
      }

      // === OjoAlDato ===
      if (incluirOjo) {
        mensaje += `📊 *#OjoAlDato (${ojo.departamento})*\n${ojo.texto}\n\n`;
      }

      // 🆕 === MENSAJE ESPECIAL AL FINAL ===
      if (mensajeEspecial && mensajeEspecial.posicion === "final") {
        mensaje += `\n${mensajeEspecial.mensaje}\n`;
      }

      // === Enviar ===
      try {
        await sendMessage(sub.telefono, mensaje);
        await registrarLog(sub.telefono, mensaje, 'envio_diario');
        console.log(`✅ Enviado a ${sub.telefono}`);
        totalEnviados++;
      } catch (err) {
        await registrarLog(sub.telefono, mensaje + "\n[ERROR] " + err.message, 'error');
        console.error(`❌ Error enviando a ${sub.telefono}:`, err.message);
        totalErrores++;
      }
    }

    // === Resumen Admin ===
    const admin = process.env.ADMIN_NUMBER || '502XXXXXXXX';
    const resumen = `
🟢 *Envío diario completado*
✅ Enviados: ${totalEnviados}
❌ Errores: ${totalErrores}
📊 OjoAlDato enviado: ${ojo ? ojo.departamento : 'No disponible'}
🕒 ${new Date().toLocaleString('es-GT')}
`;
    try {
      await sendMessage(admin, resumen);
      await registrarLog(admin, resumen, 'resumen_envio');
    } catch (e) {
      console.log("⚠️ No se pudo enviar resumen al admin:", e.message);
    }

    await pool.end();
    console.log('🟢 Finalizado y DB cerrada.');

  } catch (err) {
    console.error("❌ Error global:", err.message);
    try { await pool.end(); } catch {}
  }
}

module.exports = enviarNoticiasDelDia;

if (require.main === module) {
  enviarNoticiasDelDia()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}
