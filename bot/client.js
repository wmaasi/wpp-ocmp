const wppconnect = require('@wppconnect-team/wppconnect');

let clientInstance = null;

async function getClient() {
  if (clientInstance) return clientInstance;

  clientInstance = await wppconnect.create({
    session: 'ocmp-bot',
    headless: false, // o true si no quieres abrir el navegador
    browserArgs: ['--no-sandbox'],
    puppeteerOptions: {
      args: ['--no-sandbox'],
    },
  });

  return clientInstance;
}

module.exports = { getClient };
