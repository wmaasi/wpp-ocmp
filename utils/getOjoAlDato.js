// utils/getOjoAlDato.js
/**
 * Versión ajustada para devolver el #OjoAlDato del día actual
 * como OBJETO:
 * {
 *   departamento: string,
 *   texto: string,
 *   fecha: string (dd/mm/yyyy)
 * }
 *
 * Opcionalmente acepta un parámetro `departamento` para filtrar,
 * pero si no se envía, toma el último registro del día.
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

    // Quitar encabezado
    const datos = rows.slice(1).filter(r => r[0] && r[1] && r[4]);

    // Fecha actual en formato dd/mm/yyyy (zona horaria Guatemala)
    const hoyGT = new Date().toLocaleDateString('es-GT', {
      timeZone: 'America/Guatemala',
    });

    // Normalizar fecha tipo "1/11/2025" vs "01/11/2025"
    const formatear = f => {
      const [d, m, y] = f.split(/[\/\-]/);
      return `${parseInt(d)}/${parseInt(m)}/${y}`;
    };

    const hoyNormalizado = formatear(hoyGT);

    // 1) Filtrar SOLO filas del día de hoy
    let delDia = datos.filter(r => {
      const fecha = formatear(r[0].trim());
      return fecha === hoyNormalizado;
    });

    if (!delDia.length) {
      console.log(`⚠️ No hay #OjoAlDato para hoy (${hoyNormalizado})`);
      return null;
    }

    // 2) Si se pasa un departamento, filtrar por ese depto o 'todos'
    if (departamento) {
      const depNorm = departamento.toLowerCase();
      const filtrados = delDia.filter(r => {
        const depto = (r[4] || '').trim().toLowerCase();
        return depto === depNorm || depto === 'todos';
      });

      if (filtrados.length) {
        delDia = filtrados;
      } else {
        console.log(
          `⚠️ No hay #OjoAlDato para hoy (${hoyNormalizado}) en ${departamento}, usando cualquiera del día.`
        );
      }
    }

    // 3) Tomar el ÚLTIMO registro del día (por si hay varios)
    const [fecha, dato, , , depto] = delDia[delDia.length - 1];

    // Limpiar prefijo "#OjoAlDato"
    const textoLimpio = (dato || '').replace(/^#?OjoAlDato\s*[-–—:]?\s*/i, '').trim();

    const resultado = {
      fecha: formatear(fecha.trim()),
      departamento: (depto || '').trim(),
      texto: textoLimpio,
    };

    return resultado;

  } catch (error) {
    console.error('❌ Error al obtener el OjoAlDato:', error);
    return null;
  }
}

// === 3. Prueba directa desde consola ===
if (require.main === module) {
  const departamento = process.argv[2] || null;
  console.log(`🚀 Probando getOjoAlDato(${departamento || 'Todos'})...\n`);
  getOjoAlDato(departamento).then(res => {
    console.log(res || '⚠️ Sin resultado');
  });
}

module.exports = getOjoAlDato;
