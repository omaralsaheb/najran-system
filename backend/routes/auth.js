const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../db/db');

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET;

// POST /api/auth/login  { email, password }
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'لازم بريد إلكتروني وكلمة سر' });

  const result = await pool.query(
    `SELECT e.id, e.name, e.password_hash, e.active, r.key AS role_key, r.label AS role_label, r.permissions
     FROM employees e JOIN roles r ON e.role_id = r.id
     WHERE e.email = $1`,
    [email]
  );
  const user = result.rows[0];
  if (!user || !user.active) return res.status(401).json({ error: 'بيانات دخول غير صحيحة' });

  const match = await bcrypt.compare(password, user.password_hash);
  if (!match) return res.status(401).json({ error: 'بيانات دخول غير صحيحة' });

  const token = jwt.sign(
    {
      id: user.id,
      name: user.name,
      roleKey: user.role_key,
      roleLabel: user.role_label,
      permissions: user.permissions,
    },
    JWT_SECRET,
    { expiresIn: '12h' }
  );

  res.json({ token, user: { id: user.id, name: user.name, role: user.role_label, permissions: user.permissions } });
});

// GET /api/auth/needs-setup — true when the system has zero employees yet
// (frontend uses this to show a "first-time setup" form instead of the normal login)
router.get('/needs-setup', async (req, res) => {
  const result = await pool.query('SELECT COUNT(*) AS n FROM employees');
  res.json({ needsSetup: parseInt(result.rows[0].n, 10) === 0 });
});

// POST /api/auth/first-setup  { name, email, password }
// Only works while the employees table is empty — creates the very first CEO
// account directly from the browser, no terminal/seed-script needed. Once any
// employee exists, this route refuses forever.
router.post('/first-setup', async (req, res) => {
  const countResult = await pool.query('SELECT COUNT(*) AS n FROM employees');
  if (parseInt(countResult.rows[0].n, 10) > 0) {
    return res.status(403).json({ error: 'في حسابات مسجلة أصلاً — الإعداد الأول تم من قبل' });
  }
  const { name, email, password } = req.body;
  if (!name || !email || !password || password.length < 6) {
    return res.status(400).json({ error: 'الاسم، البريد، وكلمة سر لا تقل عن 6 أحرف كلها مطلوبة' });
  }
  const role = await pool.query("SELECT id FROM roles WHERE key = 'ceo'");
  if (role.rows.length === 0) {
    return res.status(500).json({ error: 'جدول الأدوار فاضي — شغّل schema.sql الأول' });
  }
  const hash = await bcrypt.hash(password, 10);
  await pool.query(
    'INSERT INTO employees (name, email, password_hash, role_id) VALUES ($1,$2,$3,$4)',
    [name, email, hash, role.rows[0].id]
  );
  res.status(201).json({ ok: true });
});

module.exports = router;
