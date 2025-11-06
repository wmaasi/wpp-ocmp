#!/bin/bash
# === Script de prueba para diagnosticar cron ===

PROJECT_DIR="/home/william_maas/wpp-ocmp"
LOG_DIR="$PROJECT_DIR/logs"
mkdir -p "$LOG_DIR"

LOG_FILE="$LOG_DIR/cron-test.log"

{
  echo "============================================"
  echo "🕒 Fecha: $(date)"
  echo "👤 Usuario: $(whoami)"
  echo "📂 Directorio actual: $(pwd)"
  echo "🌍 PATH: $PATH"
  echo "🔍 Node path: $(which node || echo 'node no encontrado')"
  echo "============================================"
} >> "$LOG_FILE" 2>&1

# Prueba ejecutando el JS real
cd "$PROJECT_DIR/cron" || exit 1
/usr/bin/node -v >> "$LOG_FILE" 2>&1
/usr/bin/node sendDailyNews-test.js >> "$LOG_FILE" 2>&1

echo "✅ Finalizó prueba de cron." >> "$LOG_FILE"
