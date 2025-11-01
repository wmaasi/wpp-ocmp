const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const pool = require('../../db'); // conexión a MySQL

// Middleware para proteger rutas
function requireLogin(req, res, next) {
  if (!req.session.user) return res.redirect('/admin/login');
  next();
}

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

// Panel principal
router.get('/', requireLogin, async (req, res) => {
  const [suscriptores] = await pool.query('SELECT * FROM suscriptores ORDER BY fecha_suscripcion DESC LIMIT 10');
  const [logs] = await pool.query('SELECT * FROM logs ORDER BY fecha DESC LIMIT 10');
  res.render('admin', { user: req.session.user, suscriptores, logs });
});

// Listado de suscriptores con filtros y paginación
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

// Obtener un suscriptor por ID (JSON para modal)
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

// Gráfica de actividad (últimos 7 días)
router.get('/grafica', requireLogin, async (req, res) => {
  const [result] = await pool.query(`
    SELECT DATE(fecha) as dia, COUNT(*) as total
    FROM logs
    GROUP BY dia
    ORDER BY dia DESC
    LIMIT 7
  `);

  const ordered = result.reverse();
  const labels = ordered.map(row => row.dia.toISOString().split('T')[0]);
  const data = ordered.map(row => row.total);

  res.json({ labels, data });
});

// Crear campaña (programación de envíos)
router.post('/campanias', requireLogin, async (req, res) => {
  const { titulo, mensaje, departamento, fecha_envio } = req.body;

  try {
    await pool.query(
      'INSERT INTO campanias (titulo, mensaje, departamento, fecha_envio, creado_por) VALUES (?, ?, ?, ?, ?)',
      [titulo, mensaje, departamento, fecha_envio, req.session.user.id]
    );
    res.redirect('/admin');
  } catch (err) {
    console.error('Error al programar campaña:', err);
    res.status(500).send('Error al programar campaña');
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

// Actualizar usuario (con cambio opcional de contraseña)
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

// Mostrar logs
// Vista de logs con filtros
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