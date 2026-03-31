module.exports = {
  apps: [
    {
      name: 'wpp-bot',
      script: 'bot.js',

      env: {
        TZ: 'America/Guatemala',
        NODE_ENV: 'production',
      },

      // Reinicio automático con backoff exponencial
      autorestart: true,
      max_restarts: 20,
      min_uptime: '30s',      // Si cae antes de 30s, cuenta como crash
      restart_delay: 5000,    // Esperar 5s antes de reiniciar
      exp_backoff_restart_delay: 100, // Backoff exponencial hasta 16s

      // Memoria: reiniciar si supera 1GB (Chromium puede crecer mucho)
      max_memory_restart: '1G',

      // Logs
      out_file: './logs/bot-out.log',
      error_file: './logs/bot-error.log',
      merge_logs: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
    },
  ],
};
