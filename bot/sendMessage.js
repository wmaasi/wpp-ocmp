const { getClient } = require('./client'); // Asegúrate de que el cliente esté disponible

/**
 * Envía un mensaje de texto por WhatsApp a un número.
 * @param {string} numero - El número de teléfono en formato internacional (sin el +).
 * @param {string} mensaje - El mensaje de texto a enviar.
 */
async function sendMessage(numero, mensaje) {
  const client = await getClient(); // Esto depende de cómo inicializaste el cliente
  try {
    await client.sendText(`${numero}@c.us`, mensaje);
    console.log(`✅ Mensaje enviado a ${numero}`);
  } catch (error) {
    console.error(`❌ Error al enviar mensaje a ${numero}:`, error.message);
  }
}

module.exports = sendMessage;
