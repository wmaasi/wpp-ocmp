// utils/getOjoAlDato.js
/**
 * Versión definitiva compatible con Node 18–22 y googleapis/gaxios.
 * Cubre Headers, Blob, FormData y ReadableStream.
 */

// === 1. Polyfills globales mínimos ===
try {
  if (typeof global.Headers === 'undefined') {
    const { Headers } = require('node-fetch');
    global.Headers = Headers;
    console.log('✅ Headers global definido desde node-fetch');
  }

  if (typeof global.Blob === 'undefined') {
    const { Blob } = require('buffer');
    global.Blob = Blob;
    console.log('✅ Blob global definido desde buffer');
  }

  if (typeof global.FormData === 'undefined') {
    global.FormData = require('form-data');
    console.log('✅ FormData global definido desde form-data');
  }

  if (typeof global.ReadableStream === 'undefined') {
    const { ReadableStream } = require('node:stream/web');
    global.ReadableStream = ReadableStream;
    console.log('✅ ReadableStream global definido desde node:stream/web');
  }
} catch (err) {
  console.warn('⚠️ Error inicializando polyfills:', err.message);
}

// === 2. Cargar entorno ===
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

// === 3. Cargar googleapis (ya con polyfills activos) ===
const { google } = require('googleapis');

async function getOjoAlDato(departamento = null) {
  try {
    console.log('🔐 Autenticando con Google Sheets API...');

    const auth = new google.auth.GoogleAuth({
      keyFile: process.env.GOOGLE_KEY_FILE,
      scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
    });

    const sheets = google.sheets({ version: 'v4', auth });
    const spreadsheetId = process.env.SHEETS_ID;
    const range = 'OjoAlDato!B:F'; // B=Fecha, C=Dato, F=Departamento

    console.log(`📄 Leyendo hoja ${spreadsheetId}...`);
    const res = await sheets.spreadsheets.values.get({ spreadsheetId, range });

    const rows = res.data.values || [];
    if (!rows.length) {
      console.warn('⚠️ No hay filas en la hoja de cálculo.');
      return null;
    }

    console.log(`✅ Se encontraron ${rows.length - 1} registros (sin encabezado).`);

    // Filtrar filas válidas
    const datos = rows.slice(1).filter(r => r[0] && r[1] && r[4]);

    // Buscar por departamento o "Todos"
    const resultados = datos.filter(r => {
      const depto = (r[4] || '').trim().toLowerCase();
      return (
        !departamento ||
        depto === departamento.toLowerCase() ||
        depto === 'todos'
      );
    });

    if (!resultados.length) {
      console.warn(`⚠️ No hay datos para el departamento: ${departamento || '(todos)'}`);
      return null;
    }

    const ultimo = resultados[resultados.length - 1];
    const [fecha, dato, , , depto] = ultimo;

    const limpio = dato.replace(/^#?OjoAlDato\s*[-–—:]?\s*/i, '');
    const texto = `📊 #OjoAlDato (${fecha}, ${depto}): ${limpio}`;
    return texto;

  } catch (error) {
    console.error('❌ Error al obtener el OjoAlDato:', error);
    return null;
  }
}

// === 4. Ejecutar desde consola ===
if (require.main === module) {
  const departamento = process.argv[2] || null;
  console.log(`\n🚀 Probando getOjoAlDato(${departamento || 'Todos'})...\n`);

  getOjoAlDato(departamento)
    .then((resultado) => {
      if (resultado) console.log(`\n✅ Resultado:\n${resultado}\n`);
      else console.log('\n⚠️ No se encontró ningún resultado.\n');
    })
    .catch((err) => console.error('❌ Error general:', err));
}

module.exports = getOjoAlDato;