#!/bin/bash
echo "[$(date)] 🔍 Iniciando prueba de getOjoAlDato..." >> "/Users/wmaas/Desktop/OCMP/ojoalanota/wpp-ocmp/logs/cron-status.log"

PROJECT_DIR="/Users/wmaas/Desktop/OCMP/ojoalanota/wpp-ocmp"
NODE="/usr/local/bin/node"
LOG_FILE="$PROJECT_DIR/logs/test-ojoaldato.log"

cd "$PROJECT_DIR/utils" || exit 1

# Ejecutar el script directamente
$NODE getOjoAlDato.js guatemala >> "$LOG_FILE" 2>&1

echo "[$(date)] ✅ Finalizó prueba de getOjoAlDato" >> "/Users/wmaas/Desktop/OCMP/ojoalanota/wpp-ocmp/logs/cron-status.log"
