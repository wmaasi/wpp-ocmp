#!/bin/bash

# === Configuración ===
PROJECT_DIR="/home/william_maas/wpp-ocmp"
LOG_DIR="$PROJECT_DIR/logs"
SCRIPT_DIR="$PROJECT_DIR/cron"
NODE="/usr/bin/node"
LOG_FILE="$LOG_DIR/envio-news.log"
STATUS_FILE="$LOG_DIR/cron-status.log"

# === Fecha y hora actual ===
FECHA=$(date)
DIA_SEMANA=$(date +%u)  # 1=Lunes, 5=Viernes

# === Crear carpeta de logs si no existe ===
mkdir -p "$LOG_DIR"

# === Escribir log de inicio ===
echo "[$FECHA] 🟡 Iniciando ejecución de envío de noticias (día $DIA_SEMANA)..." >> "$STATUS_FILE"

# === Seleccionar script según el día ===
if [ "$DIA_SEMANA" -ge 1 ] && [ "$DIA_SEMANA" -le 4 ]; then
  # Lunes a jueves → envío diario por departamento
  echo "[$FECHA] 🗓️ Día entre lunes y jueves → ejecutando sendDailyNews.js" >> "$STATUS_FILE"
  cd "$SCRIPT_DIR" || exit 1
  $NODE sendDailyNews.js >> "$LOG_FILE" 2>&1
  echo "[$FECHA] ✅ Finalizó envío diario (departamentos)" >> "$STATUS_FILE"

elif [ "$DIA_SEMANA" -eq 5 ]; then
  # Viernes → envío semanal por tema
  echo "[$FECHA] 🗓️ Viernes → ejecutando sendWeeklyNews.js" >> "$STATUS_FILE"
  cd "$SCRIPT_DIR" || exit 1
  $NODE sendWeeklyNews.js >> "$LOG_FILE" 2>&1
  echo "[$FECHA] ✅ Finalizó envío semanal (temas)" >> "$STATUS_FILE"

else
  # Sábado o domingo → no enviar
  echo "[$FECHA] ⏸️ Fin de semana → no se envían noticias." >> "$STATUS_FILE"
fi

# === Fin del proceso ===
echo "[$FECHA] 🟢 Tarea finalizada correctamente." >> "$STATUS_FILE"
