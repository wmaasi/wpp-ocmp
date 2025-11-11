#!/bin/bash
cd /home/william_maas/wpp-ocmp
echo "🕓 Ejecutando envío automático de campañas $(date)" >> logs/campaigns.log
/usr/bin/node /home/william_maas/wpp-ocmp/cron/sendCampaigns.js >> logs/campaigns.log 2>&1
echo "✅ Finalizado $(date)" >> logs/campaigns.log
