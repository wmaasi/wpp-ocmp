module.exports = {
  apps: [
    {
      name: "wpp-bot",
      script: "bot.js",
      env: {
        TZ: "America/Guatemala",
        NODE_ENV: "production"
      }
    }
  ]
};
