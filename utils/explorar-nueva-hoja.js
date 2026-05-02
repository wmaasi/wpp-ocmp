const { google } = require('googleapis');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const NEW_SHEETS_ID = '1AzLAZT_EkuNe4Ky6basQiR3yTS-x_eNtyJufAjKw7sY';

async function explorar() {
  try {
    const auth = new google.auth.GoogleAuth({
      keyFile: process.env.GOOGLE_KEY_FILE,
      scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
    });
    const sheets = google.sheets({ version: 'v4', auth });

    const meta = await sheets.spreadsheets.get({ spreadsheetId: NEW_SHEETS_ID });
    const sheetsList = meta.data.sheets.map(s => ({
      titulo: s.properties.title,
      filas: s.properties.gridProperties.rowCount,
      columnas: s.properties.gridProperties.columnCount,
    }));

    console.log('✅ ACCESO EXITOSO');
    console.log('📄 Título:', meta.data.properties.title);
    console.log('\n📑 Pestañas:');
    sheetsList.forEach((s, i) => {
      console.log(`  ${i+1}. "${s.titulo}" — ${s.filas} filas x ${s.columnas} columnas`);
    });

    console.log('\n🔍 Primeras filas de cada pestaña:\n');
    for (const sheet of sheetsList) {
      const res = await sheets.spreadsheets.values.get({
        spreadsheetId: NEW_SHEETS_ID,
        range: `'${sheet.titulo}'!A1:Z5`,
      });
      const rows = res.data.values || [];
      console.log(`--- "${sheet.titulo}" ---`);
      rows.forEach((row, i) => console.log(`  Fila ${i+1}: ${JSON.stringify(row)}`));
      console.log('');
    }

    const tieneOjoAlDato = sheetsList.find(s => s.titulo === 'OjoAlDato');
    console.log('─────────────────────────────────');
    if (tieneOjoAlDato) {
      console.log('✅ Pestaña "OjoAlDato" SÍ existe → el código actual puede funcionar.');
    } else {
      console.log('⚠️  Pestaña "OjoAlDato" NO existe.');
      console.log('   Pestañas disponibles:', sheetsList.map(s => `"${s.titulo}"`).join(', '));
    }
  } catch (e) {
    console.error('❌ Error:', e.code, e.message);
  }
}

explorar();
