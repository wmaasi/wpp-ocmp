// /cron/sendDailyNews.js
require('dotenv').config({ path: __dirname + '/../.env' });

const pool = require('../db');
const fetch = require('node-fetch');
const sendMessage = require('../bot/sendMessage');
const { registrarLog } = require('../db/queries/logs');
const getOjoAlDato = require('../utils/getOjoAlDato');

// === Función para eliminar https:// o http:// ===
const limpiarLink = (url) => url.replace(/^https?:\/\//, '');

// ============== NUEVO FLUJO 1 MENSAJE POR USUARIO ===================
async function enviarNoticiasDelDia() {
  try {
    console.log('🕓 Iniciando envío automático de noticias diarias...\n');

    // === 1. Obtener notas del día desde WordPress ===
    const response = await fetch('https://www.ojoconmipisto.com/wp-json/ocmp/v1/notas-hoy');
    const notasPorDepto = await response.json();

    const departamentosConNotas = Object.keys(notasPorDepto);
    console.log('🗂️ Departamentos con notas hoy:', departamentosConNotas.length ? departamentosConNotas : '[]');

    // === 2. Obtener suscriptores activos ===
    const [suscriptores] = await pool.query(`
      SELECT * FROM suscriptores 
      WHERE estado = 'activo'
      AND departamento IS NOT NULL
    `);

    if (!suscriptores.length) {
      console.log('⚠️ No hay suscriptores activos. Cancelando envío.');
      await pool.end();
      return;
    }

    console.log(`👥 Suscriptores activos encontrados: ${suscriptores.length}`);

    const frasesIntro = [
      'Mientras que [TITULAR],',
      'Te contamos que [TITULAR],',
      'Te sacamos de la duda [TITULAR],',
      '¿Ya te enteraste que [TITULAR]?',
      'Esto pasó hoy: [TITULAR]',
      'Por si no sabías [TITULAR]',
      '¿Viste que [TITULAR]?',
    ];

    let totalEnviados = 0;
    let totalErrores = 0;

    // === 3. Iterar por suscriptor → consolidar TODO en un solo mensaje
    for (const sub of suscriptores) {
      const nombre = sub.nombre?.split(' ')[0] || '';
      let mensaje = '';
      let notasUsuario = [];

      // === 3.1 Convertir JSON de departamentos
      let deptosSuscriptor = [];
      try {
        deptosSuscriptor = JSON.parse(sub.departamento);
      } catch {
        deptosSuscriptor = [];
      }

      if (!Array.isArray(deptosSuscriptor)) deptosSuscriptor = [];

      const normalizar = (str) =>
        str.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

      // === 3.2 Reunir notas de TODOS los departamentos del suscriptor
      for (const d of deptosSuscriptor) {
        const deptoNormalizado = normalizar(d);

        for (const k of Object.keys(notasPorDepto)) {
          if (normalizar(k) === deptoNormalizado) {
            notasUsuario.push(...notasPorDepto[k]);
          }
        }
      }

      // === 3.3 Quitar duplicados por link
      const unicos = {};
      notasUsuario.forEach(n => unicos[n.link] = n);
      notasUsuario = Object.values(unicos);

      // === 3.4 Obtener OjoAlDato (primer depto donde tenga notas o “Guatemala”)
      let deptoOjo = deptosSuscriptor.find(d => {
        const nd = normalizar(d);
        return Object.keys(notasPorDepto).some(k => normalizar(k) === nd);
      }) || "Guatemala";

      let ojoDato = await getOjoAlDato(deptoOjo);
      if (ojoDato) {
        ojoDato = ojoDato.replace(/^#?OjoAlDato\s*[-–—:]?\s*/i, '');
      }

      // === 3.5 Construir mensaje único ===
      const intro = `🌇 ¡Buenas tardes ${nombre}! Te traigo el resumen del día.\n\n`;

      let cuerpo = '';

      if (notasUsuario.length > 0) {
        cuerpo += `📌 Estas son tus noticias de hoy:\n\n`;

        cuerpo += notasUsuario.map(nota => {
          const frase = frasesIntro[Math.floor(Math.random() * frasesIntro.length)];
          const apertura = frase.replace('[TITULAR]', nota.title);

          // link sin https:// para evitar previsualización
          return `• ${apertura}\n${limpiarLink(nota.link)}`;
        }).join('\n\n');
      } else {
        cuerpo += `Hoy no hubo notas para tus departamentos seleccionados.\n\n`;
      }

      // === OjoAlDato
      if (ojoDato) {
        cuerpo += `\n\n📊 *#OjoAlDato*\n${ojoDato}\n`;
      }

      mensaje = intro + cuerpo;

      // === 3.6 Enviar mensaje único al usuario
      try {
        await sendMessage(sub.telefono, mensaje);

        await registrarLog(sub.telefono, mensaje, 'enviado_unico');

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

    // === 4. Resumen final
    console.log(`\n📊 Resumen del envío diario:`);
    console.log(`✅ ${totalEnviados} enviados correctamente.`);
    console.log(`❌ ${totalErrores} con errores.\n`);

    const adminNumber = process.env.ADMIN_NUMBER || '502XXXXXXXXX';
    const resumen = `
🟢 *Envío diario completado*

📨 *Modo:* 1 mensaje por usuario
✅ Enviados: ${totalEnviados}
❌ Errores: ${totalErrores}
🕒 Hora de finalización: ${new Date().toLocaleString('es-GT')}
`;

    try {
      await sendMessage(adminNumber, resumen);
      await registrarLog(adminNumber, resumen, 'resumen_envio');
      console.log(`📤 Resumen enviado al administrador (${adminNumber})`);
    } catch (e) {
      console.error(`⚠️ No se pudo enviar el resumen al administrador:`, e.message);
    }

    await pool.end();
    console.log('🟢 Conexión a base de datos cerrada.');

  } catch (err) {
    console.error('❌ Error global al enviar noticias:', err);
    try { await pool.end(); } catch {}
  }
}

module.exports = enviarNoticiasDelDia;

if (require.main === module) {
  enviarNoticiasDelDia()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}
