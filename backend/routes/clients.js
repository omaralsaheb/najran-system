const express = require('express');
const pool = require('../db/db');
const { requireAuth, requireModule } = require('../middleware/auth');

const router = express.Router();

router.get('/', requireAuth, requireModule('overview'), async (req, res) => {
  const result = await pool.query('SELECT * FROM clients ORDER BY created_at DESC');
  res.json(result.rows);
});

router.get('/:id', requireAuth, requireModule('overview'), async (req, res) => {
  const result = await pool.query('SELECT * FROM clients WHERE id = $1', [req.params.id]);
  if (result.rows.length === 0) return res.status(404).json({ error: 'العميل غير موجود' });
  res.json(result.rows[0]);
});

// body: { name, industry, instagram }
router.post('/', requireAuth, requireModule('overview'), async (req, res) => {
  const { name, industry, instagram } = req.body;
  if (!name || !industry) return res.status(400).json({ error: 'اسم الشركة والمجال مطلوبين' });
  const result = await pool.query(
    'INSERT INTO clients (name, industry, instagram) VALUES ($1,$2,$3) RETURNING *',
    [name, industry, instagram || null]
  );
  res.status(201).json(result.rows[0]);
});

// PATCH brief: { business, audience, voice, notes }
router.patch('/:id/brief', requireAuth, requireModule('overview'), async (req, res) => {
  const result = await pool.query(
    'UPDATE clients SET brief = $1 WHERE id = $2 RETURNING *',
    [JSON.stringify(req.body), req.params.id]
  );
  res.json(result.rows[0]);
});

module.exports = router;
