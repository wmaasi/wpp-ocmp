require('dotenv').config({ path: __dirname + '/../.env' });

const pool = require('../db');
const fetch = require('node-fetch');
const sendMessage = require('../bot/sendMessage');
const { registrarLog } = require('../db/queries/logs');
const getOjoAlDato = require('../utils/getOjoAlDato');

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

    // === 2. Simular lista de suscriptores: solo William ===
    const suscriptores = [
      {
        nombre: 'William',
        telefono: '50255629247',
        departamento: JSON.stringify(['Guatemala']), // Puedes ajustar si querés probar otro depto
        estado: 'activo',
      },
    ];

    console.log('\n🧪 Modo prueba: solo William (1 suscriptor)');
    console.log('📱 Enviando al número:', suscriptores[0].telefono);

    let totalEnviados = 0;
    let totalErrores = 0;

    const frasesIntro = [
      'Mientras que [TITULAR],',
      'Te contamos que [TITULAR],',
      'Te sacamos de la duda [TITULAR],',
      '¿Ya te enteraste que [TITULAR]?',
      'Esto pasó hoy: [TITULAR]',
      'Por si no sabías [TITULAR]',
      '¿Viste que [TITULAR]?',
    ];

    // === 3. Usar solo el primer departamento detectado ===
    const depto = departamentos[0];
    const notas = notasPorDepto[depto];
    console.log(`\n🧩 Enviando prueba con el departamento: ${depto}`);

    // === 4. Obtener #OjoAlDato (opcional) ===
    let datoExtra = await getOjoAlDato(depto);
    if (datoExtra) {
      datoExtra = datoExtra.replace(/^#?OjoAlDato\s*[-–—:]?\s*/i, '');
      datoExtra = `📊 #OjoAlDato:\n${datoExtra}`;
    }

    // === 5. Enviar el mensaje ===
    for (const sub of suscriptores) {
      const nombre = sub.nombre?.split(' ')[0] || '';
      const intro = `🌇 ¡Buenas tardes ${nombre}! Te traigo las noticias del día para complementar tu regreso a casa.\n\n`;

      const cuerpo = notas.map(nota => {
        const frase = frasesIntro[Math.floor(Math.random() * frasesIntro.length)];
        const apertura = frase.replace('[TITULAR]', nota.title);
        return `• ${apertura}\n${nota.link}`;
      }).join('\n\n');

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

    console.log(`\n✅ Prueba finalizada: ${totalEnviados} enviados ✅, ${totalErrores} errores ❌.`);
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
