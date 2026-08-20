const express = require('express');
const pool = require('../db/db');
const { requireAuth } = require('../middleware/auth');
const { syncContentRow } = require('../services/metaSync');

const router = express.Router();

// GET /api/content?clientId=
router.get('/', requireAuth, async (req, res) => {
  const result = await pool.query(
    `SELECT * FROM content WHERE ($1::int IS NULL OR client_id = $1) ORDER BY published_at DESC NULLS LAST`,
    [req.query.clientId || null]
  );
  res.json(result.rows);
});

// POST /api/content — register a new Reel/Story/Post
// body: { clientId, type, title, pageName, mediaLink, publishedAt }
router.post('/', requireAuth, async (req, res) => {
  const { clientId, type, title, pageName, mediaLink, publishedAt } = req.body;
  if (!clientId || !type || !mediaLink) {
    return res.status(400).json({ error: 'العميل، نوع المحتوى، ورابط المنشور مطلوبين' });
  }
  const result = await pool.query(
    `INSERT INTO content (client_id, type, title, page_name, media_link, published_at)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [clientId, type, title || null, pageName || null, mediaLink, publishedAt || new Date()]
  );
  res.status(201).json(result.rows[0]);
});

// POST /api/content/:id/sync — pull fresh numbers from Meta right now (manual refresh button)
router.post('/:id/sync', requireAuth, async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM content WHERE id = $1', [req.params.id]);
  if (rows.length === 0) return res.status(404).json({ error: 'المحتوى غير موجود' });
  if (!rows[0].media_id) {
    return res.status(400).json({ error: 'لازم نربط media_id من Meta الأول قبل ما نقدر نسحب أرقام' });
  }
  await syncContentRow(rows[0]);
  const updated = await pool.query('SELECT * FROM content WHERE id = $1', [req.params.id]);
  res.json(updated.rows[0]);
});

// GET /api/content/:id/history — full permanent time-series (growth chart data)
router.get('/:id/history', requireAuth, async (req, res) => {
  const result = await pool.query(
    'SELECT views, likes, comments, shares, recorded_at FROM analytics_history WHERE content_id = $1 ORDER BY recorded_at ASC',
    [req.params.id]
  );
  res.json(result.rows);
});

module.exports = router;
