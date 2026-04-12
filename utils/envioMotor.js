// utils/envioMotor.js
const sendMessage = require('../bot/sendMessage');
const sendImageMessage = require('../bot/sendImageMessage');

// === Configuración del motor ===
const CONFIG = {
  LOTE_SIZE: 15,
  DELAY_MSG_MIN: 3000,
  DELAY_MSG_MAX: 8000,
  DELAY_LOTE_MIN: 180000,
  DELAY_LOTE_MAX: 360000,
  DELAY_REINTENTO_FACTOR: 2,
  MAX_REINTENTOS: 2,
  CIRCUIT_BREAKER_UMBRAL: 5,
  VENTANA_INICIO: 9,
  VENTANA_FIN: 19,
};

// === Utilidades ===
function delayAleatorio(min, max) {
  return new Promise(r => setTimeout(r, Math.floor(Math.random() * (max - min + 1)) + min));
}

function saludoPorHora() {
  const hora = new Date().toLocaleString('en-US', {
    timeZone: 'America/Guatemala',
    hour: 'numeric',
    hour12: false,
  });
  const h = parseInt(hora);
  if (h < 12) return 'Buenos días';
  if (h < 18) return 'Buenas tardes';
  return 'Buenas noches';
}

const CIERRES = [
  'Hasta pronto 👋',
  'Nos leemos mañana 📰',
  'Buen resto de día ✌️',
  'Seguimos informando 🗞️',
];

function cierreAleatorio() {
  return CIERRES[Math.floor(Math.random() * CIERRES.length)];
}

function dentroDeVentana() {
  const hora = new Date().toLocaleString('en-US', {
    timeZone: 'America/Guatemala',
    hour: 'numeric',
    hour12: false,
  });
  const h = parseInt(hora);
  return h >= CONFIG.VENTANA_INICIO && h < CONFIG.VENTANA_FIN;
}

// === Motor principal ===
/**
 * Envía mensajes a una lista de suscriptores con lotes, delays y circuit breaker.
 *
 * @param {Array} suscriptores - Lista de objetos { telefono, nombre }
 * @param {Function} construirMensaje - Función async(sub, extras) → string del mensaje
 * @param {Object} extras - Datos adicionales para construirMensaje (notas, titulares, etc.)
 * @param {Object} opciones - { registrarLog, adminNumber, etiqueta }
 * @returns {Object} { enviados, errores, fallidos }
 */
async function ejecutarEnvio(suscriptores, construirMensaje, extras = {}, opciones = {}) {
  const { registrarLog, adminNumber, etiqueta = 'envio' } = opciones;

  // Verificar ventana horaria
  if (!dentroDeVentana()) {
    console.warn(`⚠️ [${etiqueta}] Fuera de ventana horaria (9am-7pm GT). Envío cancelado.`);
    return { enviados: 0, errores: 0, fallidos: [] };
  }

  const lotes = [];
  for (let i = 0; i < suscriptores.length; i += CONFIG.LOTE_SIZE) {
    lotes.push(suscriptores.slice(i, i + CONFIG.LOTE_SIZE));
  }

  console.log(`🚀 [${etiqueta}] Iniciando envío: ${suscriptores.length} suscriptores en ${lotes.length} lotes`);

  let enviados = 0;
  let errores = 0;
  let fallidos = [];
  let erroresConsecutivos = 0;

  for (let i = 0; i < lotes.length; i++) {
    const lote = lotes[i];
    console.log(`\n📦 [${etiqueta}] Lote ${i + 1}/${lotes.length} — ${lote.length} mensajes`);

    for (const sub of lote) {
      // Circuit breaker
      if (erroresConsecutivos >= CONFIG.CIRCUIT_BREAKER_UMBRAL) {
        console.error(`🔴 [${etiqueta}] Circuit breaker activado — ${erroresConsecutivos} errores consecutivos. Pausando envío.`);
        if (registrarLog && adminNumber) {
          await registrarLog(adminNumber, `🔴 Circuit breaker activado en campaña ${etiqueta}. Envío pausado.`, 'error_critico').catch(() => { });
        }
        if (adminNumber) {
          await sendMessage(adminNumber, `🔴 *Alerta:* El envío "${etiqueta}" fue pausado por ${erroresConsecutivos} errores consecutivos. Revisar el bot.`).catch(() => { });
        }
        return { enviados, errores, fallidos };
      }

      try {
        const mensaje = await construirMensaje(sub, extras);
        if (mensaje && typeof mensaje === 'object' && mensaje.tipo === 'imagen') {
          await sendImageMessage(sub.telefono, mensaje.imagePath, mensaje.texto);
        } else {
          await sendMessage(sub.telefono, mensaje);
        }

        if (registrarLog) {
          await registrarLog(sub.telefono, mensaje, etiqueta).catch(() => { });
        }

        console.log(`✅ Enviado a ${sub.telefono}`);
        enviados++;
        erroresConsecutivos = 0;

      } catch (err) {
        console.error(`❌ Error enviando a ${sub.telefono}:`, err.message);
        errores++;
        erroresConsecutivos++;
        fallidos.push({ telefono: sub.telefono, error: err.message, intentos: 1 });

        if (registrarLog) {
          await registrarLog(sub.telefono, `Error: ${err.message}`, 'error').catch(() => { });
        }
      }

      // Delay entre mensajes
      await delayAleatorio(CONFIG.DELAY_MSG_MIN, CONFIG.DELAY_MSG_MAX);
    }

    // Delay entre lotes (excepto después del último)
    if (i < lotes.length - 1) {
      const delayLote = Math.floor(Math.random() * (CONFIG.DELAY_LOTE_MAX - CONFIG.DELAY_LOTE_MIN + 1)) + CONFIG.DELAY_LOTE_MIN;
      const minutos = (delayLote / 60000).toFixed(1);
      console.log(`⏸️ [${etiqueta}] Pausa entre lotes: ${minutos} min`);
      await new Promise(r => setTimeout(r, delayLote));
    }
  }

  // === Reintentos de fallidos ===
  if (fallidos.length > 0) {
    console.log(`\n🔄 [${etiqueta}] Reintentando ${fallidos.length} mensajes fallidos...`);
    await delayAleatorio(CONFIG.DELAY_LOTE_MIN, CONFIG.DELAY_LOTE_MAX);

    const fallidos2 = [];
    for (const f of fallidos) {
      if (f.intentos >= CONFIG.MAX_REINTENTOS) {
        fallidos2.push(f);
        continue;
      }

      try {
        const sub = suscriptores.find(s => s.telefono === f.telefono);
        if (!sub) continue;

        const mensaje = await construirMensaje(sub, extras);
        await sendMessage(sub.telefono, mensaje);

        console.log(`✅ Reintento exitoso: ${f.telefono}`);
        enviados++;
        errores--;

      } catch (err) {
        console.error(`❌ Reintento fallido: ${f.telefono}:`, err.message);
        fallidos2.push({ ...f, intentos: f.intentos + 1 });
      }

      await delayAleatorio(CONFIG.DELAY_MSG_MIN * CONFIG.DELAY_REINTENTO_FACTOR, CONFIG.DELAY_MSG_MAX * CONFIG.DELAY_REINTENTO_FACTOR);
    }

    fallidos = fallidos2;
  }

  // === Resumen ===
  console.log(`\n📊 [${etiqueta}] Resumen final:`);
  console.log(`   ✅ Enviados: ${enviados}`);
  console.log(`   ❌ Errores: ${errores}`);
  console.log(`   🔴 Fallidos definitivos: ${fallidos.length}`);

  return { enviados, errores, fallidos };
}

module.exports = {
  ejecutarEnvio,
  saludoPorHora,
  cierreAleatorio,
  delayAleatorio,
  dentroDeVentana,
  CONFIG,
};