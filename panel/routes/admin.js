// panel/routes/admin.js
const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const pool = require('../../db'); // conexión a MySQL

const multer = require('multer');
const path = require('path');

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, path.join(__dirname, '../../uploads')),
  filename: (req, file, cb) => {
    const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, unique + path.extname(file.originalname));
  }
});
const upload = multer({ storage });

// Middleware para proteger rutas
function requireLogin(req, res, next) {
  if (!req.session.user) return res.redirect('/admin/login');
  next();
}

// ==============================================
// Autenticación
// ==============================================

// Vista login
router.get('/login', (req, res) => {
  res.render('login', { error: null });
});

// Procesar login
router.post('/login', async (req, res) => {
  const { usuario, password } = req.body;
  const [rows] = await pool.query('SELECT * FROM usuarios WHERE usuario = ?', [usuario]);

  if (rows.length === 0) {
    return res.render('login', { error: 'Usuario no encontrado' });
  }

  const user = rows[0];
  const match = await bcrypt.compare(password, user.password);

  if (!match) {
    return res.render('login', { error: 'Contraseña incorrecta' });
  }

  req.session.user = {
    id: user.id,
    username: user.nombre,
    rol: user.rol
  };

  res.redirect('/admin');
});

// Cerrar sesión
router.get('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/admin/login'));
});

// ==============================================
// Panel principal
// ==============================================
router.get('/', requireLogin, async (req, res) => {
  const [suscriptores] = await pool.query('SELECT * FROM suscriptores ORDER BY fecha_suscripcion DESC LIMIT 10');
  const [logs] = await pool.query('SELECT * FROM logs ORDER BY fecha DESC LIMIT 10');
  res.render('admin', { user: req.session.user, suscriptores, logs });
});

// ==============================================
// Gestión de Suscriptores
// ==============================================

// Listado con filtros y paginación
router.get('/suscriptores', requireLogin, async (req, res) => {
  const pagina = parseInt(req.query.pagina) || 1;
  const limite = 10;
  const offset = (pagina - 1) * limite;

  const { q, departamento, estado } = req.query;
  const filtros = [];
  const valores = [];

  if (q) {
    filtros.push(`(nombre LIKE ? OR telefono LIKE ?)`);
    valores.push(`%${q}%`, `%${q}%`);
  }

  if (departamento) {
    filtros.push(`departamento LIKE ?`);
    valores.push(`%"${departamento}"%`);
  }

  if (estado) {
    filtros.push(`estado = ?`);
    valores.push(estado);
  }

  const whereClause = filtros.length ? `WHERE ${filtros.join(' AND ')}` : '';

  const [total] = await pool.query(`SELECT COUNT(*) AS total FROM suscriptores ${whereClause}`, valores);
  const totalPaginas = Math.ceil(total[0].total / limite);

  const [suscriptores] = await pool.query(
    `SELECT * FROM suscriptores ${whereClause} ORDER BY id DESC LIMIT ? OFFSET ?`,
    [...valores, limite, offset]
  );

  const departamentos = [
    "Guatemala", "Alta Verapaz", "Baja Verapaz", "Chimaltenango", "Chiquimula",
    "El Progreso", "Escuintla", "Huehuetenango", "Izabal", "Jalapa", "Jutiapa",
    "Petén", "Quetzaltenango", "Quiché", "Retalhuleu", "Sacatepéquez",
    "San Marcos", "Santa Rosa", "Sololá", "Suchitepéquez", "Totonicapán", "Zacapa"
  ];

  res.render('suscriptores/index', {
    title: 'Gestión de Suscriptores',
    user: req.session.user,
    suscriptores,
    departamentos,
    pagina,
    totalPaginas,
    filtro: { q, departamento, estado }
  });
});

// Obtener un suscriptor por ID
router.get('/suscriptores/:id', requireLogin, async (req, res) => {
  const [rows] = await pool.query('SELECT * FROM suscriptores WHERE id = ?', [req.params.id]);
  if (rows.length === 0) return res.status(404).json({ error: 'No encontrado' });

  const s = rows[0];
  try {
    s.departamento = JSON.parse(s.departamento);
  } catch (e) {
    // ya es texto simple
  }

  res.json(s);
});

// Crear nuevo suscriptor
router.post('/suscriptores/crear', requireLogin, async (req, res) => {
  const { nombre, telefono, departamento, temas, estado } = req.body;
  await pool.query(
    'INSERT INTO suscriptores (nombre, telefono, departamento, temas, estado, fecha_suscripcion) VALUES (?, ?, ?, ?, ?, NOW())',
    [nombre, telefono, JSON.stringify([departamento]), temas, estado]
  );
  res.redirect('/admin/suscriptores');
});

// Actualizar suscriptor
router.post('/suscriptores/actualizar', requireLogin, async (req, res) => {
  const { id, nombre, telefono, departamento, temas, estado } = req.body;
  await pool.query(
    'UPDATE suscriptores SET nombre = ?, telefono = ?, departamento = ?, temas = ?, estado = ? WHERE id = ?',
    [nombre, telefono, JSON.stringify([departamento]), temas, estado, id]
  );
  res.redirect('/admin/suscriptores');
});

// Eliminar suscriptor
router.post('/suscriptores/eliminar/:id', requireLogin, async (req, res) => {
  await pool.query('DELETE FROM suscriptores WHERE id = ?', [req.params.id]);
  res.redirect('/admin/suscriptores');
});

// ==============================================
// 📊 Gráfica combinada de actividad
// ==============================================
router.get('/grafica', requireLogin, async (req, res) => {
  try {
    const [mensajes] = await pool.query(`
      SELECT DATE(fecha) AS dia, COUNT(*) AS total
      FROM logs
      WHERE estado IN ('enviado', 'mensaje_enviado')
      GROUP BY DATE(fecha)
      ORDER BY dia ASC;
    `);

    const [suscripciones] = await pool.query(`
      SELECT DATE(fecha) AS dia, COUNT(*) AS total
      FROM logs
      WHERE estado IN ('suscripcion', 'reactivacion')
      GROUP BY DATE(fecha)
      ORDER BY dia ASC;
    `);

    const [desuscripciones] = await pool.query(`
      SELECT DATE(fecha) AS dia, COUNT(*) AS total
      FROM logs
      WHERE estado = 'desuscripcion'
      GROUP BY DATE(fecha)
      ORDER BY dia ASC;
    `);

    // ✅ Total actual de suscriptores activos
    const [[{ total_activos }]] = await pool.query(`
      SELECT COUNT(*) AS total_activos FROM suscriptores WHERE estado = 'activo';
    `);

    const normalizar = (v) => {
      if (!v) return null;
      if (v instanceof Date) return v.toISOString().split('T')[0];
      if (typeof v === 'string' && v.includes('T')) return v.split('T')[0];
      return v;
    };

    const fechas = [
      ...new Set([
        ...mensajes.map(m => normalizar(m.dia)),
        ...suscripciones.map(s => normalizar(s.dia)),
        ...desuscripciones.map(d => normalizar(d.dia))
      ])
    ].filter(Boolean).sort((a, b) => new Date(a) - new Date(b));

    const dataMensajes = fechas.map(f => mensajes.find(m => normalizar(m.dia) === f)?.total || 0);
    const dataSuscripciones = fechas.map(f => suscripciones.find(s => normalizar(s.dia) === f)?.total || 0);
    const dataDesuscripciones = fechas.map(f => desuscripciones.find(d => normalizar(d.dia) === f)?.total || 0);

    const labels = fechas.map(f => {
      const date = new Date(f);
      return `${String(date.getUTCDate()).padStart(2, '0')}/${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
    });

    res.json({
      total_activos,
      labels,
      datasets: [
        { label: 'Mensajes enviados', data: dataMensajes, backgroundColor: 'rgba(59,130,246,0.7)', yAxisID: 'y' },
        { label: 'Suscripciones', data: dataSuscripciones, backgroundColor: 'rgba(34,197,94,0.7)', yAxisID: 'y' },
        { label: 'Desuscripciones', data: dataDesuscripciones, backgroundColor: 'rgba(239,68,68,0.7)', yAxisID: 'y' }
      ]
    });
  } catch (error) {
    console.error('❌ Error al generar gráfica:', error);
    res.status(500).json({ error: 'Error al generar la gráfica' });
  }
});

// ==============================================
// 📢 Gestión de Campañas
// ==============================================

// Ver listado
router.get('/campanias', requireLogin, async (req, res) => {
  const [campanias] = await pool.query('SELECT * FROM campanias ORDER BY fecha_creacion DESC');
  res.render('campanias/index', {
    title: 'Gestión de Campañas',
    user: req.session.user,
    campanias
  });
});

// Crear nueva
router.post('/campanias/crear', requireLogin, upload.single('imagen'), async (req, res) => {
  const { titulo, mensaje, filtros_departamentos, filtros_temas, fecha_programada } = req.body;
  const imagen = req.file ? `/uploads/${req.file.filename}` : null;

  try {
    await pool.query(
      'INSERT INTO campanias (titulo, mensaje, filtros_departamentos, filtros_temas, fecha_programada, creada_por, imagen) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [
        titulo,
        mensaje,
        filtros_departamentos ? JSON.stringify(filtros_departamentos.split(',')) : null,
        filtros_temas ? JSON.stringify(filtros_temas.split(',')) : null,
        fecha_programada || null,
        req.session.user.username,
        imagen
      ]
    );
    res.redirect('/admin/campanias');
  } catch (err) {
    console.error('❌ Error creando campaña:', err);
    res.status(500).send('Error al crear campaña');
  }
});

// Obtener campaña por ID (para modal de detalle)
router.get('/campanias/:id', requireLogin, async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM campanias WHERE id = ?', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ error: 'No encontrada' });
    const campania = rows[0];

    // Intentar parsear los filtros JSON
    try {
      campania.filtros_departamentos = JSON.parse(campania.filtros_departamentos || '[]');
    } catch {
      campania.filtros_departamentos = [];
    }

    try {
      campania.filtros_temas = JSON.parse(campania.filtros_temas || '[]');
    } catch {
      campania.filtros_temas = [];
    }

    res.json(campania);
  } catch (error) {
    console.error('❌ Error obteniendo campaña:', error);
    res.status(500).json({ error: 'Error obteniendo campaña' });
  }
});

// Enviar campaña manualmente
router.post('/campanias/enviar/:id', requireLogin, async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM campanias WHERE id = ?', [req.params.id]);
    if (!rows.length) return res.status(404).send('Campaña no encontrada');
    const camp = rows[0];

    // ✅ Parsear filtros JSON si existen
    let filtrosDepartamentos = [];
    let filtrosTemas = [];
    try {
      if (camp.filtros_departamentos) filtrosDepartamentos = JSON.parse(camp.filtros_departamentos);
    } catch {}
    try {
      if (camp.filtros_temas) filtrosTemas = JSON.parse(camp.filtros_temas);
    } catch {}

    // ✅ Construir la consulta segura
    let sql = "SELECT * FROM suscriptores WHERE estado='activo'";
    const filtros = [];
    const params = [];

    if (filtrosDepartamentos.length > 0 && !filtrosDepartamentos.includes("Todos")) {
      filtros.push(`JSON_OVERLAPS(departamento, ?)`);
      params.push(JSON.stringify(filtrosDepartamentos));
    }

    if (filtrosTemas.length > 0 && !filtrosTemas.includes("Todos")) {
      filtros.push(`JSON_OVERLAPS(temas, ?)`);
      params.push(JSON.stringify(filtrosTemas));
    }

    if (filtros.length > 0) sql += " AND " + filtros.join(' AND ');

    const [subs] = await pool.query(sql, params);

    if (!subs.length) {
      console.warn('⚠️ No hay suscriptores para esta campaña.');
      await pool.query('UPDATE campanias SET estado="cancelada" WHERE id=?', [camp.id]);
      return res.redirect('/admin/campanias');
    }

    const sendMessage = require('../../bot/sendMessage');
    await pool.query('UPDATE campanias SET estado="enviando" WHERE id=?', [camp.id]);

    for (const s of subs) {
      try {
        await sendMessage(s.telefono, camp.mensaje);
        await pool.query(
          'INSERT INTO campania_envios (id_campania, id_suscriptor, numero, estado, fecha_envio) VALUES (?, ?, ?, "enviado", NOW())',
          [camp.id, s.id, s.telefono]
        );
      } catch (err) {
        console.error('Error enviando a', s.telefono, err.message);
        await pool.query(
          'INSERT INTO campania_envios (id_campania, id_suscriptor, numero, estado) VALUES (?, ?, ?, "error")',
          [camp.id, s.id, s.telefono]
        );
      }
    }

    await pool.query('UPDATE campanias SET estado="enviada" WHERE id=?', [camp.id]);
    res.redirect('/admin/campanias');
  } catch (error) {
    console.error('❌ Error al enviar campaña:', error);
    res.status(500).send('Error al enviar campaña');
  }
});

// Cancelar campaña manualmente
router.post('/campanias/cancelar/:id', requireLogin, async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM campanias WHERE id = ?', [req.params.id]);
    if (!rows.length) return res.status(404).send('Campaña no encontrada');

    const camp = rows[0];
    if (camp.estado === 'enviada' || camp.estado === 'cancelada') {
      return res.status(400).send('La campaña ya fue procesada o cancelada');
    }

    await pool.query('UPDATE campanias SET estado = "cancelada" WHERE id = ?', [camp.id]);
    res.redirect('/admin/campanias');
  } catch (err) {
    console.error('❌ Error cancelando campaña:', err);
    res.status(500).send('Error al cancelar la campaña');
  }
});

// ==============================================
// Gestión de Usuarios
// ==============================================

// Listado de usuarios
router.get('/usuarios', requireLogin, async (req, res) => {
  const pagina = parseInt(req.query.pagina) || 1;
  const limite = 10;
  const offset = (pagina - 1) * limite;

  const [total] = await pool.query('SELECT COUNT(*) AS total FROM usuarios');
  const totalPaginas = Math.ceil(total[0].total / limite);

  const [usuarios] = await pool.query(
    'SELECT id, nombre, usuario, rol, fecha_creacion FROM usuarios ORDER BY id DESC LIMIT ? OFFSET ?',
    [limite, offset]
  );

  res.render('usuarios/index', {
    title: 'Gestión de Usuarios',
    user: req.session.user,
    usuarios,
    pagina,
    totalPaginas
  });
});

// Obtener usuario por ID
router.get('/usuarios/:id', requireLogin, async (req, res) => {
  const [rows] = await pool.query('SELECT id, nombre, usuario, rol, fecha_creacion FROM usuarios WHERE id = ?', [req.params.id]);
  if (rows.length === 0) return res.status(404).json({ error: 'No encontrado' });
  res.json(rows[0]);
});

// Crear nuevo usuario
router.post('/usuarios/crear', requireLogin, async (req, res) => {
  const { nombre, usuario, password, rol } = req.body;
  const hashed = await bcrypt.hash(password, 10);
  await pool.query(
    'INSERT INTO usuarios (nombre, usuario, password, rol, fecha_creacion) VALUES (?, ?, ?, ?, NOW())',
    [nombre, usuario, hashed, rol]
  );
  res.redirect('/admin/usuarios');
});

// Actualizar usuario
router.post('/usuarios/actualizar', requireLogin, async (req, res) => {
  const { id, nombre, usuario, password, rol } = req.body;

  if (password && password.trim() !== "") {
    const hashed = await bcrypt.hash(password, 10);
    await pool.query(
      'UPDATE usuarios SET nombre = ?, usuario = ?, password = ?, rol = ? WHERE id = ?',
      [nombre, usuario, hashed, rol, id]
    );
  } else {
    await pool.query(
      'UPDATE usuarios SET nombre = ?, usuario = ?, rol = ? WHERE id = ?',
      [nombre, usuario, rol, id]
    );
  }

  res.redirect('/admin/usuarios');
});

// Eliminar usuario
router.post('/usuarios/eliminar/:id', requireLogin, async (req, res) => {
  await pool.query('DELETE FROM usuarios WHERE id = ?', [req.params.id]);
  res.redirect('/admin/usuarios');
});

// ==============================================
// Logs (filtros y vista)
// ==============================================
router.get('/logs', requireLogin, async (req, res) => {
  const { fechaInicio, fechaFin, estado, numero } = req.query;
  let query = 'SELECT * FROM logs WHERE 1=1';
  const params = [];

  if (fechaInicio) {
    query += ' AND fecha >= ?';
    params.push(`${fechaInicio} 00:00:00`);
  }

  if (fechaFin) {
    query += ' AND fecha <= ?';
    params.push(`${fechaFin} 23:59:59`);
  }

  if (estado && estado !== 'todos') {
    query += ' AND estado = ?';
    params.push(estado);
  }

  if (numero) {
    query += ' AND numero LIKE ?';
    params.push(`%${numero}%`);
  }

  query += ' ORDER BY fecha DESC LIMIT 100';
  const [logs] = await pool.query(query, params);

  res.render('logs/index', {
    logs,
    filtros: { fechaInicio, fechaFin, estado, numero },
  });
});

module.exports = router;