require('dotenv').config();
const { create } = require('@wppconnect-team/wppconnect');
const pool = require('./db');

async function enviarMensajesPendientes() {
  const [pendientes] = await pool.query(`
    SELECT * FROM campanias
    WHERE estado = 'pendiente' AND fecha_envio <= NOW()
  `);

  if (pendientes.length === 0) return;

  const client = await create({ session: 'enviosProgramados', headless: true });

  for (const campania of pendientes) {
    const [subs] = await pool.query('SELECT telefono FROM suscriptores WHERE estado="activo" AND departamento = ?', [campania.departamento]);

    for (const sub of subs) {
      try {
        await client.sendText(`${sub.telefono}@c.us`, campania.mensaje);

        // Guardar en logs
        await pool.query(
          'INSERT INTO logs (mensaje, numero, estado) VALUES (?, ?, ?)',
          [campania.mensaje, sub.telefono, 'enviado']
        );
      } catch (err) {
        console.error('Error enviando a', sub.telefono, err);
        await pool.query(
          'INSERT INTO logs (mensaje, numero, estado) VALUES (?, ?, ?)',
          [campania.mensaje, sub.telefono, 'fallido']
        );
      }
    }

    await pool.query('UPDATE campanias SET estado = "enviado" WHERE id = ?', [campania.id]);
  }
}

enviarMensajesPendientes();
