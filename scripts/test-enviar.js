const enviarNoticiasDelDia = require('./sendDailyNews');

(async () => {
  try {
    await enviarNoticiasDelDia();
    console.log('✅ Envío manual completado.');
  } catch (err) {
    console.error('❌ Error durante el envío manual:', err);
  }
})();
