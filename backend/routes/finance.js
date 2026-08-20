const express = require('express');
const pool = require('../db/db');
const { requireAuth, requireModule } = require('../middleware/auth');

const router = express.Router();

// GET /api/finance — one row per client, with computed total
router.get('/', requireAuth, requireModule('finance'), async (req, res) => {
  const result = await pool.query(`
    SELECT c.id AS client_id, c.name AS client_name,
      COALESCE(f.advance_paid, 0)   AS advance_paid,
      COALESCE(f.extra_expenses, 0) AS extra_expenses,
      COALESCE(f.advance_paid, 0) + COALESCE(f.extra_expenses, 0) AS total,
      f.updated_at
    FROM clients c
    LEFT JOIN client_finance f ON f.client_id = c.id
    ORDER BY c.name
  `);
  res.json(result.rows);
});

// PUT /api/finance/:clientId  { advancePaid, extraExpenses }
// Upserts the client's current numbers AND appends a permanent audit-trail row —
// nothing here is ever deleted, so you can always answer "who changed what, when".
router.put('/:clientId', requireAuth, requireModule('finance'), async (req, res) => {
  const { advancePaid, extraExpenses } = req.body;
  const clientId = req.params.clientId;

  const result = await pool.query(
    `INSERT INTO client_finance (client_id, advance_paid, extra_expenses, updated_at)
     VALUES ($1, $2, $3, now())
     ON CONFLICT (client_id)
     DO UPDATE SET advance_paid = $2, extra_expenses = $3, updated_at = now()
     RETURNING *`,
    [clientId, advancePaid || 0, extraExpenses || 0]
  );

  await pool.query(
    `INSERT INTO finance_activity (client_id, employee_id, advance_paid, extra_expenses)
     VALUES ($1, $2, $3, $4)`,
    [clientId, req.user.id, advancePaid || 0, extraExpenses || 0]
  );

  res.json(result.rows[0]);
});

// GET /api/finance/:clientId/history — full audit trail for one client, never purged
router.get('/:clientId/history', requireAuth, requireModule('finance'), async (req, res) => {
  const result = await pool.query(
    `SELECT fa.*, e.name AS employee_name FROM finance_activity fa
     LEFT JOIN employees e ON fa.employee_id = e.id
     WHERE fa.client_id = $1 ORDER BY fa.created_at DESC`,
    [req.params.clientId]
  );
  res.json(result.rows);
});

module.exports = router;
