require('dotenv').config({ path: __dirname + '/../.env' });

const pool = require('../db');
const fetch = require('node-fetch');
const sendMessage = require('../bot/sendMessage');
const { registrarLog } = require('../db/queries/logs');
const getOjoAlDato = require('../utils/getOjoAlDato'); // 🆕 integración

async function enviarNoticiasDelDia() {
  try {
    // === 1. Obtener las notas del día desde el endpoint de WordPress ===
    const response = await fetch('https://www.ojoconmipisto.com/wp-json/ocmp/v1/notas-hoy');
    const notasPorDepto = await response.json();

    const departamentos = Object.keys(notasPorDepto);
    console.log('🗂️ Departamentos detectados hoy:', departamentos.length > 0 ? departamentos : '[]');
    console.log('\n📰 Notas agrupadas por departamento:');

    for (const depto of departamentos) {
      const notas = notasPorDepto[depto];
      console.log(`- ${depto} (${notas.length} nota(s))`);
      for (const nota of notas) {
        console.log(`   📝 ${nota.title}`);
      }
    }

    // === 2. Obtener suscriptores activos ===
    const [suscriptores] = await pool.query(`
      SELECT * FROM suscriptores 
      WHERE estado = 'activo' 
      AND departamento IS NOT NULL
    `);

    let totalEnviados = 0;
    let totalErrores = 0;

    console.log('\n🚀 Preparando envío de mensajes diarios...\n');

    const frasesIntro = [
      'Mientras que [TITULAR],',
      'Te contamos que [TITULAR],',
      'Te sacamos de la duda [TITULAR],',
      '¿Ya te enteraste que [TITULAR]?',
      'Esto pasó hoy: [TITULAR]',
      'Por si no sabías [TITULAR]',
      '¿Viste que [TITULAR]?',
    ];

    // === 3. Iterar por departamento ===
    for (const depto of departamentos) {
      const notas = notasPorDepto[depto];

      // Normalizador para comparar departamentos sin acentos
      const normalizar = (str) =>
        str.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

      // Filtrar suscriptores que coinciden con el departamento actual
      const suscriptoresFiltrados = suscriptores.filter(sub => {
        try {
          const deptos = JSON.parse(sub.departamento);
          if (!Array.isArray(deptos)) return false;
          return deptos.some(d => normalizar(d) === normalizar(depto));
        } catch (e) {
          return false;
        }
      });

      if (suscriptoresFiltrados.length === 0) continue;

      console.log(`- ${depto}: ${suscriptoresFiltrados.length} suscriptor(es)`);
      for (const s of suscriptoresFiltrados) {
        console.log(`   📱 ${s.nombre}: ${s.telefono}`);
      }

      // === 4. Obtener el #OjoAlDato del departamento ===
      let datoExtra = await getOjoAlDato(depto);
      if (datoExtra) {
        // Limpiar duplicaciones si el texto ya trae "#OjoAlDato"
        datoExtra = datoExtra.replace(/^#?OjoAlDato\s*[-–—:]?\s*/i, '');
        datoExtra = `📊 #OjoAlDato:\n${datoExtra}`;
      }

      // === 5. Enviar mensaje a cada suscriptor ===
      for (const sub of suscriptoresFiltrados) {
        const nombre = sub.nombre?.split(' ')[0] || '';
        const intro = `🌇 ¡Buenas tardes ${nombre}! Te traigo las noticias del día para complementar tu regreso a casa.\n\n`;

        const cuerpo = notas.map(nota => {
          const frase = frasesIntro[Math.floor(Math.random() * frasesIntro.length)];
          const apertura = frase.replace('[TITULAR]', nota.title);
          return `• ${apertura}\n${nota.link}`;
        }).join('\n\n');

        // Construir el mensaje completo
        const mensaje = `${intro}${cuerpo}\n\n${datoExtra || ''}`;

        try {
          await sendMessage(sub.telefono, mensaje);
          await registrarLog(sub.telefono, mensaje, 'enviado');
          totalEnviados++;
        } catch (error) {
          console.error(`❌ Error enviando a ${sub.telefono}:`, error.message);
          await registrarLog(sub.telefono, `${mensaje}\n\n[ERROR]: ${error.message}`, 'error');
          totalErrores++;
        }
      }
    }

    console.log(`\n✅ Envío finalizado: ${totalEnviados} enviados ✅, ${totalErrores} errores ❌.`);
    await pool.end();

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