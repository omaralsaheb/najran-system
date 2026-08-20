const express = require('express');
const pool = require('../db/db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
const VALID_STATUSES = ['today', 'progress', 'review', 'revision', 'done'];

// GET /api/tasks?assignee=&client=&status=
// A non-manager only ever gets their own tasks — enforced here, not just hidden in the UI.
router.get('/', requireAuth, async (req, res) => {
  const canSeeAll = req.user.permissions.includes('tasks');
  const assigneeFilter = canSeeAll ? (req.query.assignee || null) : req.user.id;

  const result = await pool.query(
    `SELECT t.*, c.name AS client_name, e.name AS assignee_name
     FROM tasks t
     LEFT JOIN clients c ON t.client_id = c.id
     LEFT JOIN employees e ON t.assignee_id = e.id
     WHERE ($1::int IS NULL OR t.assignee_id = $1)
       AND ($2::int IS NULL OR t.client_id = $2)
     ORDER BY t.created_at DESC`,
    [assigneeFilter, req.query.client || null]
  );
  res.json(result.rows);
});

// POST /api/tasks  { title, clientId, assigneeId, priority, deadline, status }
router.post('/', requireAuth, async (req, res) => {
  const { title, clientId, assigneeId, priority, deadline, status } = req.body;
  if (!title || !assigneeId || !deadline) {
    return res.status(400).json({ error: 'اسم المهمة، الموظف، والموعد مطلوبين' });
  }
  const result = await pool.query(
    `INSERT INTO tasks (title, client_id, assignee_id, priority, deadline, status)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [title, clientId || null, assigneeId, priority || 'mid', deadline, status || 'today']
  );
  await pool.query(
    'INSERT INTO task_activity (task_id, employee_id, action, detail) VALUES ($1,$2,$3,$4)',
    [result.rows[0].id, req.user.id, 'created', `أنشأها ${req.user.name}`]
  );
  res.status(201).json(result.rows[0]);
});

// PATCH /api/tasks/:id — full edit, allowed regardless of current status
// (including tasks already marked "done" — nothing here blocks editing a completed task)
// body: { title, clientId, assigneeId, priority, deadline, status, notes }
router.patch('/:id', requireAuth, async (req, res) => {
  const { title, clientId, assigneeId, priority, deadline, status, notes } = req.body;
  if (!title || !assigneeId || !deadline) {
    return res.status(400).json({ error: 'اسم المهمة، الموظف، والموعد مطلوبين' });
  }
  if (status && !VALID_STATUSES.includes(status)) return res.status(400).json({ error: 'حالة غير معروفة' });

  const result = await pool.query(
    `UPDATE tasks SET title=$1, client_id=$2, assignee_id=$3, priority=$4, deadline=$5,
       status=COALESCE($6, status), notes=$7, updated_at=now()
     WHERE id=$8 RETURNING *`,
    [title, clientId || null, assigneeId, priority || 'mid', deadline, status || null, notes || null, req.params.id]
  );
  if (result.rows.length === 0) return res.status(404).json({ error: 'المهمة غير موجودة' });

  await pool.query(
    'INSERT INTO task_activity (task_id, employee_id, action, detail) VALUES ($1,$2,$3,$4)',
    [req.params.id, req.user.id, 'edited', `عدّلها ${req.user.name}`]
  );
  res.json(result.rows[0]);
});

// PATCH /api/tasks/:id/status  { status }  — the core workflow-lifecycle endpoint
router.patch('/:id/status', requireAuth, async (req, res) => {
  const { status } = req.body;
  if (!VALID_STATUSES.includes(status)) return res.status(400).json({ error: 'حالة غير معروفة' });

  const result = await pool.query(
    'UPDATE tasks SET status = $1, updated_at = now() WHERE id = $2 RETURNING *',
    [status, req.params.id]
  );
  await pool.query(
    'INSERT INTO task_activity (task_id, employee_id, action, detail) VALUES ($1,$2,$3,$4)',
    [req.params.id, req.user.id, 'status_changed', status]
  );
  res.json(result.rows[0]);
});

// PATCH /api/tasks/:id/drive-link  { driveLink }
// This is the Photographer → Video Editor handoff: Photographer attaches the link,
// Video Editor sees it and clicks straight through to fetch the media.
router.patch('/:id/drive-link', requireAuth, async (req, res) => {
  const { driveLink } = req.body;
  const result = await pool.query(
    'UPDATE tasks SET drive_link = $1, updated_at = now() WHERE id = $2 RETURNING *',
    [driveLink, req.params.id]
  );
  await pool.query(
    'INSERT INTO task_activity (task_id, employee_id, action, detail) VALUES ($1,$2,$3,$4)',
    [req.params.id, req.user.id, 'drive_link_added', driveLink]
  );
  res.json(result.rows[0]);
});

// GET /api/tasks/:id/activity — full history log, never purged
router.get('/:id/activity', requireAuth, async (req, res) => {
  const result = await pool.query(
    `SELECT ta.*, e.name AS employee_name FROM task_activity ta
     LEFT JOIN employees e ON ta.employee_id = e.id
     WHERE ta.task_id = $1 ORDER BY ta.created_at ASC`,
    [req.params.id]
  );
  res.json(result.rows);
});

module.exports = router;
