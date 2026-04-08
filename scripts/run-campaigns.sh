#!/bin/bash
PROJECT_DIR="/home/william_maas/wpp-ocmp"
LOG_DIR="$PROJECT_DIR/logs"
NODE="/usr/bin/node"
LOG_FILE="$LOG_DIR/cron-campaigns.log"

mkdir -p "$LOG_DIR"
cd "$PROJECT_DIR/cron" || exit 1
$NODE sendCampaigns.js >> "$LOG_FILE" 2>&1
