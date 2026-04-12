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
      WHERE estado IN ('enviado', 'envio_diario', 'resumen_envio', 'enviado_unico', 'enviado_semana')
      AND fecha >= NOW() - INTERVAL 7 DAY
      GROUP BY DATE(fecha)
      ORDER BY dia ASC;
    `);

    const [suscripciones] = await pool.query(`
      SELECT DATE(fecha) AS dia, COUNT(*) AS total
      FROM logs
      WHERE estado IN ('suscripcion', 'reactivacion')
      AND fecha >= NOW() - INTERVAL 7 DAY
      GROUP BY DATE(fecha)
      ORDER BY dia ASC;
    `);

    const [desuscripciones] = await pool.query(`
      SELECT DATE(fecha) AS dia, COUNT(*) AS total
      FROM logs
      WHERE estado = 'desuscripcion'
      AND fecha >= NOW() - INTERVAL 7 DAY
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
// 📢 Gestión de Campañas (nuevo modelo)
// ==============================================

// Lista de campañas
router.get('/campanias', requireLogin, async (req, res) => {
  const [campanias] = await pool.query(`
    SELECT c.*,
      (SELECT COUNT(*) FROM campania_mensajes WHERE id_campania = c.id) AS total_mensajes,
      (SELECT COUNT(*) FROM campania_mensajes WHERE id_campania = c.id AND estado = 'enviado') AS mensajes_enviados
    FROM campanias c
    ORDER BY c.fecha_creacion DESC
  `);
  res.render('campanias/index', { title: 'Campañas', user: req.session.user, campanias });
});

// Crear nueva campaña
router.post('/campanias/crear', requireLogin, async (req, res) => {
  const { titulo, descripcion, tipo, audiencia, filtros_departamentos, filtros_temas } = req.body;
  try {
    const [result] = await pool.query(
      `INSERT INTO campanias (titulo, descripcion, tipo, audiencia, filtros_departamentos, filtros_temas, estado, creada_por, fecha_creacion)
       VALUES (?, ?, ?, ?, ?, ?, 'borrador', ?, NOW())`,
      [
        titulo,
        descripcion || null,
        tipo || 'general',
        audiencia || 'todos',
        filtros_departamentos ? JSON.stringify(filtros_departamentos.split(',')) : null,
        filtros_temas ? JSON.stringify(filtros_temas.split(',')) : null,
        req.session.user.username,
      ]
    );
    res.redirect(`/admin/campanias/${result.insertId}`);
  } catch (err) {
    console.error('❌ Error creando campaña:', err);
    res.status(500).send('Error al crear campaña');
  }
});

// Ver detalle de campaña con sus mensajes
router.get('/campanias/:id', requireLogin, async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM campanias WHERE id = ?', [req.params.id]);
    if (!rows.length) return res.redirect('/admin/campanias');
    const campania = rows[0];

    const [mensajes] = await pool.query(
      'SELECT * FROM campania_mensajes WHERE id_campania = ? ORDER BY orden ASC, fecha_programada ASC',
      [req.params.id]
    );

    const [envios] = await pool.query(
      `SELECT ce.*, s.nombre FROM campania_envios ce
       LEFT JOIN suscriptores s ON ce.id_suscriptor = s.id
       WHERE ce.id_campania = ? ORDER BY ce.fecha_envio DESC LIMIT 50`,
      [req.params.id]
    );

    res.render('campanias/detalle', {
      title: campania.titulo,
      user: req.session.user,
      campania,
      mensajes,
      envios,
    });
  } catch (err) {
    console.error('❌ Error obteniendo campaña:', err);
    res.status(500).send('Error al cargar campaña');
  }
});

// Actualizar estado de campaña
router.post('/campanias/:id/estado', requireLogin, async (req, res) => {
  const { estado } = req.body;
  const estadosValidos = ['borrador', 'activa', 'pausada', 'finalizada', 'cancelada'];
  if (!estadosValidos.includes(estado)) return res.status(400).send('Estado inválido');
  await pool.query('UPDATE campanias SET estado = ? WHERE id = ?', [estado, req.params.id]);
  res.redirect(`/admin/campanias/${req.params.id}`);
});

// Agregar mensaje a campaña
router.post('/campanias/:id/mensajes/crear', requireLogin, upload.single('imagen'), async (req, res) => {
  const { tipo, mensaje, fecha_programada, recurrente, frecuencia, orden } = req.body;
  const imagen = req.file ? `/uploads/${req.file.filename}` : null;
  try {
    await pool.query(
      `INSERT INTO campania_mensajes (id_campania, tipo, mensaje, imagen, fecha_programada, recurrente, frecuencia, orden, estado)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pendiente')`,
      [
        req.params.id,
        tipo || 'texto',
        mensaje,
        imagen,
        fecha_programada || null,
        recurrente ? 1 : 0,
        frecuencia || null,
        orden || 1,
      ]
    );
    res.redirect(`/admin/campanias/${req.params.id}`);
  } catch (err) {
    console.error('❌ Error creando mensaje:', err);
    res.status(500).send('Error al crear mensaje');
  }
});

// Eliminar mensaje de campaña
router.post('/campanias/:id/mensajes/:msgId/eliminar', requireLogin, async (req, res) => {
  try {
    await pool.query('DELETE FROM campania_mensajes WHERE id = ? AND id_campania = ?', [req.params.msgId, req.params.id]);
    res.redirect(`/admin/campanias/${req.params.id}`);
  } catch (err) {
    console.error('❌ Error eliminando mensaje:', err);
    res.status(500).send('Error al eliminar mensaje');
  }
});

// Enviar mensaje manualmente (inmediato)
router.post('/campanias/:id/mensajes/:msgId/enviar', requireLogin, async (req, res) => {
  try {
    // Programar para ahora mismo
    await pool.query(
      `UPDATE campania_mensajes SET fecha_programada = NOW(), estado = 'pendiente' WHERE id = ? AND id_campania = ?`,
      [req.params.msgId, req.params.id]
    );
    // Activar campaña si está en borrador
    await pool.query(
      `UPDATE campanias SET estado = 'activa' WHERE id = ? AND estado = 'borrador'`,
      [req.params.id]
    );
    res.redirect(`/admin/campanias/${req.params.id}`);
  } catch (err) {
    console.error('❌ Error programando envío:', err);
    res.status(500).send('Error al programar envío');
  }
});

// Cancelar campaña
router.post('/campanias/:id/cancelar', requireLogin, async (req, res) => {
  try {
    await pool.query(`UPDATE campanias SET estado = 'cancelada' WHERE id = ?`, [req.params.id]);
    await pool.query(`UPDATE campania_mensajes SET estado = 'cancelado' WHERE id_campania = ? AND estado = 'pendiente'`, [req.params.id]);
    res.redirect('/admin/campanias');
  } catch (err) {
    console.error('❌ Error cancelando campaña:', err);
    res.status(500).send('Error al cancelar campaña');
  }
});

// API: datos de campaña en JSON
router.get('/campanias/:id/json', requireLogin, async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM campanias WHERE id = ?', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'No encontrada' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Error obteniendo campaña' });
  }
});

// ==============================
// MENSAJES ESPECIALES DEL DÍA
// ==============================

// Listar todos los mensajes especiales
router.get('/mensajes-especiales', requireLogin, async (req, res) => {
  try {
    const [mensajes] = await pool.query(
      `SELECT * FROM mensajes_especiales ORDER BY fecha DESC, id DESC`
    );

    res.render('mensajes-especiales/index', {
      mensajes
    });
  } catch (error) {
    console.error('Error listando mensajes especiales:', error);
    res.status(500).send('Error al cargar mensajes especiales');
  }
});

// Mostrar formulario "Nuevo mensaje especial"
router.get('/mensajes-especiales/nuevo', requireLogin, (req, res) => {
  res.render('mensajes-especiales/nuevo');
});

// Guardar nuevo mensaje especial
router.post('/mensajes-especiales/nuevo', requireLogin, async (req, res) => {
  try {
    const { fecha, mensaje, posicion, activo } = req.body;

    await pool.query(
      `INSERT INTO mensajes_especiales (fecha, mensaje, posicion, activo)
       VALUES (?, ?, ?, ?)`,
      [fecha, mensaje, posicion, activo ? 1 : 0]
    );

    res.redirect('/admin/mensajes-especiales');
  } catch (error) {
    console.error('Error creando mensaje especial:', error);
    res.status(500).send('Error al crear mensaje especial');
  }
});

// Mostrar formulario de edición
router.get('/mensajes-especiales/editar/:id', requireLogin, async (req, res) => {
  try {
    const { id } = req.params;
    const [rows] = await pool.query(
      `SELECT * FROM mensajes_especiales WHERE id = ?`,
      [id]
    );

    if (!rows.length) {
      return res.redirect('/admin/mensajes-especiales');
    }

    res.render('mensajes-especiales/editar', {
      mensaje: rows[0]
    });
  } catch (error) {
    console.error('Error cargando mensaje especial para editar:', error);
    res.status(500).send('Error al cargar mensaje');
  }
});

// Guardar cambios de edición
router.post('/mensajes-especiales/editar/:id', requireLogin, async (req, res) => {
  try {
    const { id } = req.params;
    const { fecha, mensaje, posicion, activo } = req.body;

    await pool.query(
      `UPDATE mensajes_especiales
       SET fecha = ?, mensaje = ?, posicion = ?, activo = ?
       WHERE id = ?`,
      [fecha, mensaje, posicion, activo ? 1 : 0, id]
    );

    res.redirect('/admin/mensajes-especiales');
  } catch (error) {
    console.error('Error actualizando mensaje especial:', error);
    res.status(500).send('Error al actualizar mensaje');
  }
});

// Eliminar mensaje especial
router.post('/mensajes-especiales/eliminar/:id', requireLogin, async (req, res) => {
  try {
    const { id } = req.params;
    await pool.query(`DELETE FROM mensajes_especiales WHERE id = ?`, [id]);
    res.redirect('/admin/mensajes-especiales');
  } catch (error) {
    console.error('Error eliminando mensaje especial:', error);
    res.status(500).send('Error al eliminar mensaje');
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

// === Cerrar sesión ===
router.get('/logout', (req, res) => {
  try {
    req.session.destroy(err => {
      if (err) {
        console.error('❌ Error al cerrar sesión:', err);
        return res.status(500).send('Error al cerrar sesión');
      }
      res.clearCookie('connect.sid'); // limpia la cookie de sesión
      res.redirect('/admin/login');
    });
  } catch (error) {
    console.error('⚠️ Error inesperado al hacer logout:', error);
    res.redirect('/admin/login');
  }
});

module.exports = router;
