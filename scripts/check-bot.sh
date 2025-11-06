#!/bin/bash
# Verifica si el bot de WhatsApp está corriendo, si no, lo reinicia.

if ! pm2 status wpp-bot | grep -q "online"; then
  echo "$(date '+%F %T') 🚨 Bot caído, reiniciando..." >> ~/wpp-ocmp/logs/monitor.log
  pm2 restart wpp-bot
else
  echo "$(date '+%F %T') ✅ Bot activo." >> ~/wpp-ocmp/logs/monitor.log
fi
