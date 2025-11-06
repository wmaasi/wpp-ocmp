// client.js
const { getClient, startBot } = require('../bot');

// Devuelve el cliente existente o lo inicializa si aún no está listo
async function ensureClient() {
  let client = getClient();
  if (!client) {
    console.log('⚙️ Cliente no encontrado, inicializando...');
    client = await startBot();
  }
  return client;
}

module.exports = { getClient: ensureClient };
