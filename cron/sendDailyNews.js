// /cron/sendDailyNews.js
require('dotenv').config({ path: __dirname + '/../.env' });

const pool = require('../db');
const fetch = require('node-fetch');
const sendMessage = require('../bot/sendMessage');
const { registrarLog } = require('../db/queries/logs');
const getOjoAlDato = require('../utils/getOjoAlDato');

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

    // === 3. Lista completa de departamentos
    const todosLosDepartamentos = [
      "Guatemala", "Alta Verapaz", "Baja Verapaz", "Chimaltenango", "Chiquimula",
      "El Progreso", "Escuintla", "Huehuetenango", "Izabal", "Jalapa", "Jutiapa",
      "Petén", "Quetzaltenango", "Quiché", "Retalhuleu", "Sacatepéquez",
      "San Marcos", "Santa Rosa", "Sololá", "Suchitepéquez", "Totonicapán", "Zacapa"
    ];

    // === 4. Iterar por todos los departamentos
    for (const depto of todosLosDepartamentos) {
      const notas = notasPorDepto[depto] || [];

      // Normalizador sin acentos
      const normalizar = (str) =>
        str.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

      // Filtrar suscriptores por departamento
      const suscriptoresDepto = suscriptores.filter(sub => {
        try {
          const deptos = JSON.parse(sub.departamento);
          if (!Array.isArray(deptos)) return false;
          return deptos.some(d => normalizar(d) === normalizar(depto));
        } catch {
          return false;
        }
      });

      if (!suscriptoresDepto.length) continue;
      console.log(`📍 ${depto}: ${suscriptoresDepto.length} suscriptor(es)`);

      // === 5. Obtener el #OjoAlDato del departamento ===
      let ojoDato = await getOjoAlDato(depto);
      if (ojoDato) {
        ojoDato = ojoDato.replace(/^#?OjoAlDato\s*[-–—:]?\s*/i, '');
        ojoDato = `📊 #OjoAlDato:\n${ojoDato}`;
      }

      // === 6. Determinar tipo de envío ===
      let tipoEnvio = null;
      if (notas.length > 0) tipoEnvio = 'noticias';
      else if (!notas.length && ojoDato) tipoEnvio = 'solo_ojoaldato';
      else tipoEnvio = 'nada';

      if (tipoEnvio === 'nada') continue;

      // === 7. Enviar mensaje a cada suscriptor ===
      for (const sub of suscriptoresDepto) {
        const nombre = sub.nombre?.split(' ')[0] || '';
        let mensaje = '';

        if (tipoEnvio === 'noticias') {
          const intro = `🌇 ¡Buenas tardes ${nombre}! Te traigo las noticias del día para complementar tu regreso a casa.\n\n`;
          const cuerpo = notas.map(nota => {
            const frase = frasesIntro[Math.floor(Math.random() * frasesIntro.length)];
            const apertura = frase.replace('[TITULAR]', nota.title);
            return `• ${apertura}\n${nota.link}`;
          }).join('\n\n');
          mensaje = `${intro}${cuerpo}\n\n${ojoDato || ''}`;
        }

        if (tipoEnvio === 'solo_ojoaldato') {
          mensaje = `🌇 ¡Buenas tardes ${nombre}! No hubo notas publicadas hoy en tu departamento, pero te dejamos este dato:\n\n${ojoDato}`;
        }

        try {
          await sendMessage(sub.telefono, mensaje);

          // 👇 Registrar según tipo de envío
          const estadoLog = tipoEnvio === 'solo_ojoaldato' ? 'ojoaldato_solo' : 'enviado';
          await registrarLog(sub.telefono, mensaje, estadoLog);

          totalEnviados++;
          console.log(`✅ Enviado a ${sub.telefono}`);
        } catch (error) {
          console.error(`❌ Error enviando a ${sub.telefono}:`, error.message);
          await registrarLog(sub.telefono, `${mensaje}\n\n[ERROR]: ${error.message}`, 'error');
          totalErrores++;
        }
      }
    }

    // === 8. Resumen general ===
    console.log(`\n📊 Resumen del envío diario:`);
    console.log(`✅ ${totalEnviados} enviados correctamente.`);
    console.log(`❌ ${totalErrores} con errores.\n`);

    // === 9. Enviar resumen al administrador ===
    const adminNumber = process.env.ADMIN_NUMBER || '502XXXXXXXXX';
    const resumen = `
🟢 *Envío diario completado*

✅ Enviados: ${totalEnviados}
❌ Errores: ${totalErrores}
🕒 Hora de finalización: ${new Date().toLocaleString('es-GT')}

${totalEnviados === 0 && totalErrores === 0
        ? 'No se enviaron mensajes hoy (sin notas ni OjoAlDato).'
        : 'Revisa logs para más detalles.'}
`;

    try {
      await sendMessage(adminNumber, resumen);
      await registrarLog(adminNumber, resumen, 'resumen_envio');
      console.log(`📤 Resumen enviado al administrador (${adminNumber})`);
    } catch (e) {
      console.error(`⚠️ No se pudo enviar el resumen al administrador:`, e.message);
    }

    // === 10. Cerrar conexión ===
    await pool.end();
    console.log('🟢 Conexión a base de datos cerrada.');

  } catch (err) {
    console.error('❌ Error global al enviar noticias:', err);
    try {
      await pool.end();
    } catch (e) {
      console.error('⚠️ Error al cerrar pool:', e);
    }
  }
}

module.exports = enviarNoticiasDelDia;

if (require.main === module) {
  enviarNoticiasDelDia()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}