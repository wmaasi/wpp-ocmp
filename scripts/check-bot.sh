#!/bin/bash
LOG="$HOME/wpp-ocmp/logs/monitor.log"
TIMESTAMP=$(date '+%F %T')

# === 1. Verificar que PM2 esté online ===
if ! pm2 status wpp-bot | grep -q "online"; then
  echo "$TIMESTAMP 🚨 Bot caído (PM2 offline), reiniciando..." >> "$LOG"
  pm2 restart wpp-bot
  cd ~/wpp-ocmp && node -e "
    require('dotenv').config();
    const { alertaBotCaido } = require('./utils/notificaciones');
    alertaBotCaido('PM2 reportó bot offline').catch(()=>{});
  " &
  exit 0
fi

# === 2. Verificar que Chromium responda y esté conectado ===
HEALTH=$(curl -s --max-time 5 http://localhost:3001/health)

if [ -z "$HEALTH" ]; then
  echo "$TIMESTAMP ⚠️ Bot no responde en /health, reiniciando..." >> "$LOG"
  pm2 restart wpp-bot
  cd ~/wpp-ocmp && node -e "
    require('dotenv').config();
    const { alertaBotCaido } = require('./utils/notificaciones');
    alertaBotCaido('Bot no responde en /health').catch(()=>{});
  " &
  exit 0
fi

if ! echo "$HEALTH" | grep -q '"status":"ok"'; then
  echo "$TIMESTAMP ⚠️ Bot en estado incorrecto: $HEALTH — reiniciando..." >> "$LOG"
  pm2 restart wpp-bot
  cd ~/wpp-ocmp && node -e "
    require('dotenv').config();
    const { alertaBotCaido } = require('./utils/notificaciones');
    alertaBotCaido('$HEALTH').catch(()=>{});
  " &
  exit 0
fi

# === 3. Todo bien ===
echo "$TIMESTAMP ✅ Bot activo y saludable." >> "$LOG"
