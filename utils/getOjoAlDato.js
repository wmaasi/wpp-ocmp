// utils/getOjoAlDato.js
/**
 * Versión mejorada: solo devuelve el #OjoAlDato del día actual
 * Filtra por departamento y fecha, compatible con Node 18–22.
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

// === 2. Cargar entorno ===
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

// === 3. Cargar googleapis ===
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
    if (!rows.length) {
      console.warn('⚠️ No hay filas en la hoja.');
      return null;
    }

    // Eliminar encabezado y limpiar datos vacíos
    const datos = rows.slice(1).filter(r => r[0] && r[1] && r[4]);

    // 🗓️ Fecha actual (formato dd/mm/yyyy o similar)
    const hoy = new Date();
    const fechaHoy = hoy.toLocaleDateString('es-GT', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });

    // 🔍 Buscar por fecha y departamento (o 'Todos')
    const coincidencias = datos.filter(r => {
      const [fecha, , , , depto] = r;
      const f = fecha.trim();
      const d = (depto || '').trim().toLowerCase();
      return (
        f.includes(fechaHoy) &&
        (!departamento ||
          d === departamento.toLowerCase() ||
          d === 'todos')
      );
    });

    if (!coincidencias.length) {
      console.warn(`⚠️ No se encontró OjoAlDato de hoy (${fechaHoy}) para ${departamento || 'Todos'}`);
      return null;
    }

    // Tomar el más reciente si hubiera más de uno
    const [fecha, dato, , , depto] = coincidencias[coincidencias.length - 1];

    const limpio = dato.replace(/^#?OjoAlDato\s*[-–—:]?\s*/i, '');
    const texto = `📊 #OjoAlDato (${fecha}, ${depto}): ${limpio}`;
    console.log(`✅ OjoAlDato encontrado (${departamento}): ${texto}`);
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
    .then(resultado => {
      if (resultado) console.log(`\n✅ Resultado:\n${resultado}\n`);
      else console.log('\n⚠️ No se encontró ningún resultado.\n');
    })
    .catch(err => console.error('❌ Error general:', err));
}

module.exports = getOjoAlDato;
