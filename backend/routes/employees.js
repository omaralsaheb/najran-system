const express = require('express');
const bcrypt = require('bcryptjs');
const pool = require('../db/db');
const { requireAuth, requireModule } = require('../middleware/auth');

const router = express.Router();

// GET /api/employees — list all, with today's task counts (team page)
router.get('/', requireAuth, requireModule('team'), async (req, res) => {
  const result = await pool.query(`
    SELECT e.id, e.name, e.email, e.active, r.key AS role_key, r.label AS role_label,
      COUNT(t.id) FILTER (WHERE t.status = 'today') AS tasks_today,
      COUNT(t.id) FILTER (WHERE t.status = 'done' AND t.updated_at::date = CURRENT_DATE) AS done_today
    FROM employees e
    JOIN roles r ON e.role_id = r.id
    LEFT JOIN tasks t ON t.assignee_id = e.id
    GROUP BY e.id, r.key, r.label
    ORDER BY e.created_at
  `);
  res.json(result.rows);
});

// GET /api/employees/roles — list roles for the "add employee" dropdown
router.get('/roles', requireAuth, async (req, res) => {
  const result = await pool.query('SELECT id, key, label, permissions FROM roles ORDER BY id');
  res.json(result.rows);
});

// POST /api/employees/roles — create a brand-new role with custom permissions
// body: { key, label, permissions: ["overview","tasks",...] }
router.post('/roles', requireAuth, requireModule('settings'), async (req, res) => {
  const { key, label, permissions } = req.body;
  if (!key || !label) return res.status(400).json({ error: 'لازم مفتاح واسم للدور' });
  const result = await pool.query(
    'INSERT INTO roles (key, label, permissions) VALUES ($1,$2,$3) RETURNING *',
    [key, label, JSON.stringify(permissions || [])]
  );
  res.status(201).json(result.rows[0]);
});

// POST /api/employees — add a new employee account (admin only)
// body: { name, email, password, roleKey }
router.post('/', requireAuth, requireModule('team'), async (req, res) => {
  const { name, email, password, roleKey } = req.body;
  if (!name || !email || !password || !roleKey) {
    return res.status(400).json({ error: 'كل الحقول مطلوبة' });
  }
  const role = await pool.query('SELECT id FROM roles WHERE key = $1', [roleKey]);
  if (role.rows.length === 0) return res.status(400).json({ error: 'دور غير موجود' });

  const passwordHash = await bcrypt.hash(password, 10);
  try {
    const result = await pool.query(
      'INSERT INTO employees (name, email, password_hash, role_id) VALUES ($1,$2,$3,$4) RETURNING id, name, email',
      [name, email, passwordHash, role.rows[0].id]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'البريد الإلكتروني مستخدم' });
    throw err;
  }
});

// PATCH /api/employees/:id — edit an existing employee's name and/or role
// body: { name, roleKey }
router.patch('/:id', requireAuth, requireModule('team'), async (req, res) => {
  const { name, roleKey } = req.body;
  if (!name || !roleKey) return res.status(400).json({ error: 'الاسم والدور مطلوبين' });
  const role = await pool.query('SELECT id FROM roles WHERE key = $1', [roleKey]);
  if (role.rows.length === 0) return res.status(400).json({ error: 'دور غير موجود' });

  const result = await pool.query(
    'UPDATE employees SET name = $1, role_id = $2 WHERE id = $3 RETURNING id, name, email',
    [name, role.rows[0].id, req.params.id]
  );
  if (result.rows.length === 0) return res.status(404).json({ error: 'الموظف غير موجود' });
  res.json(result.rows[0]);
});

// PATCH /api/employees/:id/deactivate — disable an account instead of deleting it
router.patch('/:id/deactivate', requireAuth, requireModule('team'), async (req, res) => {
  await pool.query('UPDATE employees SET active = false WHERE id = $1', [req.params.id]);
  res.json({ ok: true });
});

module.exports = router;
