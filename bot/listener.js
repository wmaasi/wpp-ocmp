// listener.js
const mysql = require('mysql2/promise');
require('dotenv').config();

const connectionConfig = {
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
};

// Canon de temas válidos (forma “bonita” que guardamos en DB)
const TEMAS_VALIDOS = [
  'movilidad',
  'consejos de desarrollo',
  'congreso',
  'ambiente',
  'duda y comprueba',
  'concejos municipales',
  'acceso a la información',
];

// Mapa de normalizados → canon (acepta sin tildes y variantes)
const MAPA_TEMAS = (() => {
  const quitarTildes = (s) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '');
  const canon = {};
  for (const t of TEMAS_VALIDOS) {
    canon[quitarTildes(t)] = t; // sin tildes
    canon[t] = t; // tal cual
  }
  // Variantes comunes
  canon['acceso a la informacion'] = 'acceso a la información';
  canon['duda y comprueba'] = 'duda y comprueba';
  return canon;
})();

const usuariosPendientes = {};

async function registrarLog(conn, numero, estado, mensaje = '') {
  await conn.execute(
    'INSERT INTO logs (numero, estado, mensaje) VALUES (?, ?, ?)',
    [numero, estado, mensaje]
  );
}

// === Utilidades ===
const quitarTildes = (s) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '');
const limpiarEspacios = (s) => s.replace(/\s+/g, ' ').trim();

/**
 * Divide texto en una lista usando comas, "y" o "e" como separadores.
 * Ejemplo: "Escuintla y Chimaltenango" -> ['Escuintla', 'Chimaltenango']
 */
function dividirTextoEnLista(texto, { preservarDudaYComprueba = false } = {}) {
  let t = texto.toLowerCase().trim();

  // Preservar la frase compuesta antes de reemplazar conectores
  if (preservarDudaYComprueba) {
    t = t.replace(/duda\s*y\s*comprueba/gi, 'duda_y_comprueba');
  }

  // Reemplazar cualquier combinación de conectores ("y", "e", coma o punto y coma)
  // Ejemplo: "Escuintla y Chimaltenango" → "Escuintla,Chimaltenango"
  t = t.replace(/\s*(,|;|\by\b|\be\b)\s*/gi, ',');

  // Eliminar comas duplicadas o espacios extra
  t = t.replace(/,+/g, ',').replace(/\s*,\s*/g, ',');

  // Separar por comas limpias
  const lista = t
    .split(',')
    .map(s => limpiarEspacios(s))
    .filter(Boolean)
    .map(s => s === 'duda_y_comprueba' ? 'duda y comprueba' : s);

  return lista;
}

// Coincidencia estricta de desuscripción (evita “Baja Verapaz”)
function esComandoBaja(texto) {
  const t = limpiarEspacios(texto.toLowerCase());
  return /^(parar|detener|baja|dar de baja|darme de baja)$/.test(t);
}

// Normaliza temas a su forma “canon” y valida
function normalizarYValidarTemas(temasEntrada) {
  const resultado = [];
  const invalidos = [];

  for (const item of temasEntrada) {
    // Quitar tildes para comparar contra el mapa
    const key = quitarTildes(item);
    const canon = MAPA_TEMAS[key] || MAPA_TEMAS[item];
    if (canon) {
      resultado.push(canon);
    } else {
      invalidos.push(item);
    }
  }

  // Unicidad y orden estable
  const unicos = Array.from(new Set(resultado));
  return { validos: unicos, invalidos };
}

module.exports = function (client) {
  console.log('👂 Listener activo, esperando mensajes...');

  client.onMessage(async (message) => {

    try {

    console.log("========== NUEVO MENSAJE ==========");
    console.log("message.from:", message.from);
    console.log("message.sender:", message.sender);
    console.log("message.id:", message.id);
    console.log("message.chatId:", message.chatId);
    console.log("===================================");

    // Ignorar actualizaciones de estado (stories)
    if (message.from === 'status@broadcast' || message.chatId === 'status@broadcast') {
      return;
    }

    let numero = null;

    // 1️⃣ Intentar obtener número del formattedName
    if (message.sender?.formattedName) {
       numero = message.sender.formattedName.replace(/\D/g, ''); // quitar + y espacios
    }

    // 2️⃣ Fallback si no existe
    if (!numero && message.from) {
       numero = message.from.split('@')[0];
    }

    if (!message.body) {
      return;
    }

    const textoOriginal = message.body.trim();
    const texto = textoOriginal.toLowerCase();
    const conn = await mysql.createConnection(connectionConfig);
    let [rows] = await conn.execute('SELECT * FROM suscriptores WHERE telefono = ?', [numero]);
    let usuario = rows[0];

// 🔄 Verificar si está en campaña de reactivación
if (usuario && usuario.estado === 'inactivo') {
  const [reactivRows] = await conn.execute(
    `SELECT * FROM reactivacion_campana WHERE telefono = ? AND estado = 'enviado'`,
    [numero]
  );

  if (reactivRows.length) {
    const reactivacion = reactivRows[0];
    const departamentos = dividirTextoEnLista(textoOriginal);

    if (departamentos.length) {
      // Activar usuario con los departamentos que indicó
      await conn.execute(
        `UPDATE suscriptores SET estado = 'activo', departamento = ?, fecha_suscripcion = NOW() WHERE telefono = ?`,
        [JSON.stringify(departamentos), numero]
      );

      // Marcar reactivación como respondida
      await conn.execute(
        `UPDATE reactivacion_campana SET estado = 'respondido', fecha_respuesta = NOW() WHERE id = ?`,
        [reactivacion.id]
      );

      await client.sendText(
        message.from,
        `✅ ¡Gracias! Te hemos activado para recibir noticias de *${departamentos.join(', ')}*. Pronto recibirás tu primer resumen.`
      );

      await registrarLog(conn, numero, 'reactivacion', `Reactivado vía campaña. Deptos: ${departamentos.join(', ')}`);
      await conn.end();
      return;
    }
  }
}

    const pendiente = usuariosPendientes[numero] || {};

    // 👋 Si ya está suscrito y saluda
    const saludos = ['hola', 'buenas', 'buenos días', 'buenas tardes', 'buenas noches', 'hello', 'hi'];
    if (usuario && usuario.estado === 'activo' && saludos.includes(texto)) {
      await client.sendText(
        message.from,
        '👋 Ya estás suscrito. Escribe *cambiar* para actualizar tus preferencias o *parar* para darte de baja.'
      );
      await registrarLog(conn, numero, 'recibido', textoOriginal);
      await conn.end();
      return;
    }

    // 🛑 Desuscripción (estricta, sin falsos positivos tipo “Baja Verapaz”)
    if (esComandoBaja(textoOriginal)) {
      if (usuario) {
        await conn.execute('UPDATE suscriptores SET estado = ? WHERE telefono = ?', ['inactivo', numero]);
        await client.sendText(message.from, '❌ Te has desuscrito. Ya no recibirás mensajes.');
        await registrarLog(conn, numero, 'desuscripcion', 'Usuario se desuscribió');
      } else {
        await client.sendText(message.from, 'No estabas suscrito. Si deseas suscribirte, escribe *hola*.');
      }
      delete usuariosPendientes[numero];
      await conn.end();
      return;
    }

    // 🔁 Actualización de preferencias
    if (texto === 'cambiar' || texto === 'actualizar') {
      usuariosPendientes[numero] = { estado: 'esperando_nombre', actualizando: true };
      await client.sendText(message.from, '🔄 Vamos a actualizar tus datos. ¿Cuál es tu nombre?');
      await registrarLog(conn, numero, 'actualizacion', 'Usuario inició actualización de datos');
      await conn.end();
      return;
    }

    // 🆕 Nueva suscripción o reactivación
    if ((!usuario && !pendiente.estado) || (usuario && usuario.estado === 'inactivo' && !pendiente.estado)) {
      usuariosPendientes[numero] = {
        estado: 'esperando_nombre',
        actualizando: !!usuario
      };

      const bienvenida =
        '👋 ¡Te damos la bienvenida al *WhatsApp de Ojoconmipisto*! 🕵️‍♂️\n\n' +
        'A través de este servicio, *el Súper* 🦸🏻‍♂️ te mandará las notas que se adaptan a tus intereses.\n\n' +
        'Inicia el chat, sigue las instrucciones y listo, ya estarás dentro de nuestra *comunidad fiscalizadora*. 🧾🗳️';

      await client.sendText(message.from, bienvenida);
      await client.sendText(message.from, '👋 ¿Cuál es tu nombre?');
      await registrarLog(conn, numero, 'suscripcion', 'Inicio de suscripción');
      await conn.end();
      return;
    }

    // ✏️ Paso 1: nombre
    if (pendiente.estado === 'esperando_nombre') {
      const nombre = limpiarEspacios(textoOriginal);
      usuariosPendientes[numero].nombre = nombre;
      usuariosPendientes[numero].estado = 'esperando_departamento';
      await client.sendText(
        message.from,
        `📍 ¿Dime *${nombre}* de qué departamento(s) te interesa recibir información? (puedes escribir varios separados por coma, "y" o "e")`
      );
      await conn.end();
      return;
    }

    // 🗺️ Paso 2: departamentos
    if (pendiente.estado === 'esperando_departamento') {
      const departamentos = dividirTextoEnLista(textoOriginal);
      if (!departamentos.length) {
        await client.sendText(message.from, '⚠️ Por favor indica al menos un departamento.');
        await conn.end();
        return;
      }

      usuariosPendientes[numero].departamentos = departamentos;
      usuariosPendientes[numero].estado = 'esperando_temas';
      const nombre = usuariosPendientes[numero].nombre || 'amigo';
      await client.sendText(
        message.from,
        `🗂️ Muy bien *${nombre}*, ahora dime: ¿qué temas son los que más te interesan? (puedes escribir varios separados por coma, "y" o "e")\n\n` +
        'También puedes escribir *Todos* para recibir información de todos los temas.\n\n' +
        'Temas válidos:\n- ' + TEMAS_VALIDOS.join('\n- ')
      );
      await conn.end();
      return;
    }

    // 📰 Paso 3: temas
    if (pendiente.estado === 'esperando_temas') {
      // Preservar “duda y comprueba” como una sola unidad
      const temasInput = dividirTextoEnLista(textoOriginal, { preservarDudaYComprueba: true });

      // ¿Pidió todos?
      const pideTodos = temasInput.some(t => /^todos?$/.test(t.toLowerCase()));
      const candidatos = pideTodos ? [...TEMAS_VALIDOS] : temasInput;

      const { validos, invalidos } = normalizarYValidarTemas(candidatos);

      if (!validos.length || invalidos.length > 0) {
        await client.sendText(
          message.from,
          '⚠️ Algunos temas no son válidos. Asegúrate de usar únicamente los siguientes:\n- ' +
          TEMAS_VALIDOS.join('\n- ') + '\n\nTambién puedes escribir *Todos*.'
        );
        await conn.end();
        return;
      }

      const { nombre, departamentos } = usuariosPendientes[numero];

      // 🔍 Re-verificar existencia antes de insertar
      [rows] = await conn.execute('SELECT * FROM suscriptores WHERE telefono = ?', [numero]);
      usuario = rows[0];

      if (usuario) {
        // ✅ Reactivar o actualizar
        await conn.execute(
          `UPDATE suscriptores
           SET nombre = ?, temas = ?, departamento = ?, estado = 'activo', fecha_suscripcion = NOW()
           WHERE telefono = ?`,
          [nombre, JSON.stringify(validos), JSON.stringify(departamentos), numero]
        );

        await client.sendText(message.from, `🔄 Bienvenido de nuevo *${nombre}*! Tus preferencias han sido actualizadas.`);
        await registrarLog(conn, numero, 'reactivacion', 'Usuario reactivado o actualizado');
      } else {
        // 🆕 Crear nuevo solo si realmente no existe
        await conn.execute(
          `INSERT INTO suscriptores (nombre, telefono, temas, departamento, fecha_suscripcion, estado)
           VALUES (?, ?, ?, ?, NOW(), 'activo')`,
          [nombre, numero, JSON.stringify(validos), JSON.stringify(departamentos)]
        );
        await client.sendText(message.from, `✅ ¡Gracias *${nombre}*! Te estaremos enviando información relevante pronto.`);
        await registrarLog(conn, numero, 'suscripcion', 'Suscripción finalizada');
      }

      delete usuariosPendientes[numero];
      await conn.end();
      return;
    }

    // 👋 Usuario ya suscrito (otros mensajes)
    if (usuario && usuario.estado === 'activo') {
      await client.sendText(message.from, '👋 Ya estás suscrito. Escribe *cambiar* para actualizar tus preferencias o *parar* para darte de baja.');
      await registrarLog(conn, numero, 'recibido', textoOriginal);
    }

    await conn.end();
    } catch (error) {
      console.error('ERROR EN LISTENER: ', error);
      console.error(error.stack);

    }
  });
};
