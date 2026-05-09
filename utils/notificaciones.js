// utils/notificaciones.js
const nodemailer = require('nodemailer');
require('dotenv').config();

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: parseInt(process.env.SMTP_PORT) || 465,
  secure: true, // SSL
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

async function enviarAlerta(asunto, cuerpo) {
  try {
    await transporter.sendMail({
      from: `"OCMP Bot" <${process.env.SMTP_FROM}>`,
      to: process.env.ALERT_EMAIL,
      subject: asunto,
      text: cuerpo,
      html: `<pre style="font-family: monospace; font-size: 14px;">${cuerpo}</pre>`,
    });
    console.log(`📧 Alerta enviada: ${asunto}`);
  } catch (err) {
    console.error('❌ Error enviando alerta por email:', err.message);
  }
}

async function alertaBotCaido(detalle) {
  const cuerpo = `
🚨 ALERTA: Bot de WhatsApp caído
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Fecha: ${new Date().toLocaleString('es-GT', { timeZone: 'America/Guatemala' })}
Detalle: ${detalle}

El sistema intentará reiniciarse automáticamente.
Si el problema persiste, revisar la VM en GCP.
  `.trim();

  await enviarAlerta('🚨 Bot OCMP caído - Acción requerida', cuerpo);
}

async function alertaCircuitBreaker(campania, enviados, errores) {
  const cuerpo = `
⚠️ ALERTA: Circuit breaker activado
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Fecha: ${new Date().toLocaleString('es-GT', { timeZone: 'America/Guatemala' })}
Campaña: ${campania}
Enviados antes del corte: ${enviados}
Errores consecutivos: ${errores}

El envío fue pausado automáticamente.
Revisar el estado del bot y reiniciar si es necesario.
  `.trim();

  await enviarAlerta('⚠️ Circuit breaker activado - Envío pausado', cuerpo);
}

async function alertaEnvioCompletado(campania, enviados, errores, fallidos) {
  const cuerpo = `
✅ Envío completado
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Fecha: ${new Date().toLocaleString('es-GT', { timeZone: 'America/Guatemala' })}
Campaña: ${campania}
✅ Enviados: ${enviados}
❌ Errores: ${errores}
🔴 Fallidos definitivos: ${fallidos}
  `.trim();

  await enviarAlerta(`✅ Envío "${campania}" completado`, cuerpo);
}

module.exports = { enviarAlerta, alertaBotCaido, alertaCircuitBreaker, alertaEnvioCompletado };
