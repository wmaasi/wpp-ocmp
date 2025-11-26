// utils/getOjoAlDato.js
/**
 * Versión ajustada para devolver SOLO el #OjoAlDato del día actual
 * (fecha en horario de Guatemala)
 */

// === 1. Polyfills globales mínimos ===
try {
  if (typeof global.Headers === 'undefined') {
    const { Headers } = require('node-fetch');
    global.Headers = Headers;
  }
  if (typeof global.Blob === 'undefined') {
    const { Blob } = require('buffer');
    global.Blob = Blob;
  }
  if (typeof global.FormData === 'undefined') {
    global.FormData = require('form-data');
  }
  if (typeof global.ReadableStream === 'undefined') {
    const { ReadableStream } = require('node:stream/web');
    global.ReadableStream = ReadableStream;
  }
} catch (err) {
  console.warn('⚠️ Error inicializando polyfills:', err.message);
}

// === 2. Configuración y dependencias ===
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const { google } = require('googleapis');

async function getOjoAlDato(departamento = null) {
  try {
    const auth = new google.auth.GoogleAuth({
      keyFile: process.env.GOOGLE_KEY_FILE,
      scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
    });

    const sheets = google.sheets({ version: 'v4', auth });
    const spreadsheetId = process.env.SHEETS_ID;
    const range = 'OjoAlDato!B:F'; // B=Fecha, C=Dato, F=Departamento

    const res = await sheets.spreadsheets.values.get({ spreadsheetId, range });
    const rows = res.data.values || [];
    if (!rows.length) return null;

    // Filas sin encabezado
    const datos = rows.slice(1).filter(r => r[0] && r[1] && r[4]);

    // Fecha actual en formato dd/mm/yyyy
    const hoyGT = new Date().toLocaleDateString('es-GT', {
      timeZone: 'America/Guatemala',
    });

    // Normalizar fecha de Google Sheets (por si tiene 0 delante o distinto formato)
    const formatear = f => {
      const [d, m, y] = f.split(/[\/\-]/);
      return `${parseInt(d)}/${parseInt(m)}/${y}`;
    };

    // Filtrar los datos del día actual y del departamento correspondiente
    const resultados = datos.filter(r => {
      const fecha = formatear(r[0].trim());
      const depto = (r[4] || '').trim().toLowerCase();
      return (
        fecha === formatear(hoyGT) &&
        (!departamento ||
          depto === departamento.toLowerCase() ||
          depto === 'todos')
      );
    });

    if (!resultados.length) {
      console.log(`⚠️ No hay #OjoAlDato para hoy (${hoyGT}) en ${departamento || 'general'}`);
      return null;
    }

    // Toma el último de los de hoy
    const [fecha, dato, , , depto] = resultados[resultados.length - 1];
    const limpio = dato.replace(/^#?OjoAlDato\s*[-–—:]?\s*/i, '');
    return `📊 #OjoAlDato (${fecha}, ${depto}): ${limpio}`;

  } catch (error) {
    console.error('❌ Error al obtener el OjoAlDato:', error);
    return null;
  }
}

// === 3. Prueba directa desde consola ===
if (require.main === module) {
  const departamento = process.argv[2] || null;
  console.log(`🚀 Probando getOjoAlDato(${departamento || 'Todos'})...\n`);
  getOjoAlDato(departamento).then(res => console.log(res || '⚠️ Sin resultado'));
}

module.exports = getOjoAlDato;
