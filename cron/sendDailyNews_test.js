// /cron/sendDailyNews_test.js
require('dotenv').config({ path: __dirname + '/../.env' });

const pool = require('../db');
const fetch = require('node-fetch');
const sendMessage = require('../bot/sendMessage');
const getOjoAlDato = require('../utils/getOjoAlDato');
const generarTitularConversado = require('../utils/generarTitularChatGPT');

// === Limpiar https:// ===
const limpiarLink = (url) => url.replace(/^https?:\/\//, '');

// === Limpiar comillas ===
const limpiarComillas = (str) => str.replace(/["'“”«»]/g, '').trim();

async function enviarNoticiasTest() {
  try {
    console.log('🧪 Iniciando prueba de envío único (solo a William)...');

    const MI_NUMERO = "50255629247";
    const MI_NOMBRE = "William";

    const deptosPrueba = ["Escuintla", "Sacatepéquez", "Santa Rosa"];

    // 🆕 === LEER MENSAJE ESPECIAL SEGÚN FECHA ===
    const hoy = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    const [rows] = await pool.query(
      "SELECT mensaje, posicion FROM mensajes_especiales WHERE fecha = ? LIMIT 1",
      [hoy]
    );
    const mensajeEspecial = rows.length ? rows[0] : null;

    // === 1. Obtener notas del día ===
    const response = await fetch('https://www.ojoconmipisto.com/wp-json/ocmp/v1/notas-hoy');
    const notasPorDepto = await response.json();

    console.log("📄 Departamentos detectados hoy:", Object.keys(notasPorDepto));

    // === 2. Filtro por departamentos ===
    let notasUsuario = [];
    const normalizar = (str) =>
      str.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

    for (const d of deptosPrueba) {
      for (const k of Object.keys(notasPorDepto)) {
        if (normalizar(k) === normalizar(d)) {
          notasUsuario.push(...notasPorDepto[k]);
        }
      }
    }

    // === Quitar duplicados ===
    notasUsuario = Object.values(
      notasUsuario.reduce((acc, n) => (acc[n.link] = n, acc), {})
    );

    console.log(`📰 Notas encontradas para prueba: ${notasUsuario.length}`);

    // === 3. Obtener OjoAlDato del día ===
    let ojo = await getOjoAlDato();

    console.log("\n🟦 Resultado bruto de getOjoAlDato():");
    console.log(ojo);

    // === Validación de estructura ===
    if (!ojo || typeof ojo !== "object" || !ojo.departamento || !ojo.texto) {
      console.log("❌ ERROR: La estructura NO es válida.\nSe espera:");
      console.log(`{
  departamento: "Guatemala",
  texto: "..."
}`);
      await pool.end();
      return;
    }

    // === 3.1 Validar si corresponde a los departamentos del usuario ===
    const depOjoNorm = normalizar(ojo.departamento);
    const depsUsuarioNorm = deptosPrueba.map(d => normalizar(d));

    const usuarioTieneOjo = depsUsuarioNorm.includes(depOjoNorm);

    console.log(`🔍 ¿Usuario tiene departamento del OjoAlDato?:`, usuarioTieneOjo);

    // === 4. Crear mensaje base ===
    let mensaje = `🧪 *PRUEBA OjoAlDato + GPT*\nHola ${MI_NOMBRE}!\n\n`;

    // 🆕 === SI EL MENSAJE ESPECIAL VA AL INICIO ===
    if (mensajeEspecial && mensajeEspecial.posicion === "inicio") {
      mensaje += `${mensajeEspecial.mensaje}\n\n`;
    }

    // === 5. Notas con titulares ChatGPT ===
    if (notasUsuario.length > 0) {
      mensaje += `📌 Noticias detectadas:\n\n`;

      for (const nota of notasUsuario) {
        const original = limpiarComillas(nota.title);

        console.log("\n📝 Titular original:", original);

        let titularGPT = await generarTitularConversado(original);
        titularGPT = limpiarComillas(titularGPT);

        console.log("💬 Titular generado por ChatGPT:", titularGPT);

        mensaje += `• ${titularGPT}\n${limpiarLink(nota.link)}\n\n`;
      }
    }

    // === 6. Agregar OjoAlDato SOLO si corresponde ===
    if (usuarioTieneOjo) {
      mensaje += `\n\n📊 *#OjoAlDato (${ojo.departamento})*\n${ojo.texto}\n`;
    } else {
      console.log("🚫 El usuario NO tiene el departamento del OjoAlDato. No se incluirá.");
    }

    // 🆕 === SI EL MENSAJE ESPECIAL VA AL FINAL ===
    if (mensajeEspecial && mensajeEspecial.posicion === "final") {
      mensaje += `\n\n${mensajeEspecial.mensaje}`;
    }

    // Si no hay absolutamente nada para enviar → cancelar
    if (notasUsuario.length === 0 && !usuarioTieneOjo) {
      console.log("🚫 No hay notas ni OjoAlDato para este usuario. No enviaremos mensaje.");
      await pool.end();
      return;
    }

    // === 7. Enviar ===
    console.log("\n📤 Enviando mensaje a:", MI_NUMERO);

    await sendMessage(MI_NUMERO, mensaje);

    console.log("✅ Mensaje enviado exitosamente.");
    await pool.end();

  } catch (error) {
    console.error("❌ Error en prueba:", error.message);
    try { await pool.end(); } catch {}
  }
}

module.exports = enviarNoticiasTest;

if (require.main === module) {
  enviarNoticiasTest()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}
