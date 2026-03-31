module.exports = {
  apps: [
    {
      name: "wpp-bot",
      script: "bot.js",
      env: {
        TZ: "America/Guatemala",
        NODE_ENV: "production",
        DEBUG: "wppconnect:*,puppeteer:*,puppeteer:protocol"
      },
      // Limpiar locks de Chromium antes de iniciar el bot
      pre_start: "bash /home/william_maas/wpp-ocmp/fix_chrome_lock.sh",
      
      // Limpiar locks después de cada reinicio automático
      post_restart: "bash /home/william_maas/wpp-ocmp/fix_chrome_lock.sh",

      // Opcional: aumentar la estabilidad del proceso
      autorestart: true,
      max_restarts: 100,
      restart_delay: 3000
    }
  ]
};
