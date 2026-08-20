const axios = require('axios');
const pool = require('../db/db');

// ============================================================
// IMPORTANT — READ BEFORE TOUCHING THIS FILE
// Analytics history is kept FOREVER. There is intentionally NO
// cleanup/expiry job here. The monthly report and growth charts
// depend on this table never being purged. Do not add a 24h (or
// any) auto-delete cron on `content` or `analytics_history`.
// ============================================================

const META_ACCESS_TOKEN = process.env.META_ACCESS_TOKEN; // long-lived Page/System-User token
const GRAPH_VERSION = 'v19.0';

// Pulls current insights for one piece of content from Meta Graph API.
// mediaId = the Instagram media id (resolved once when the content is created,
// or you can resolve it from the media_link — see resolveMediaId below).
async function fetchInsights(mediaId) {
  const fields = 'like_count,comments_count,media_type';
  const insightsMetrics = 'plays,reach,shares'; // reels use "plays" for views

  const [mediaRes, insightsRes] = await Promise.all([
    axios.get(`https://graph.facebook.com/${GRAPH_VERSION}/${mediaId}`, {
      params: { fields, access_token: META_ACCESS_TOKEN },
    }),
    axios.get(`https://graph.facebook.com/${GRAPH_VERSION}/${mediaId}/insights`, {
      params: { metric: insightsMetrics, access_token: META_ACCESS_TOKEN },
    }).catch(() => ({ data: { data: [] } })), // some media types don't support all metrics
  ]);

  const insightsMap = {};
  (insightsRes.data.data || []).forEach((m) => { insightsMap[m.name] = m.values?.[0]?.value ?? 0; });

  return {
    views: insightsMap.plays ?? insightsMap.reach ?? 0,
    likes: mediaRes.data.like_count ?? 0,
    comments: mediaRes.data.comments_count ?? 0,
    shares: insightsMap.shares ?? 0,
  };
}

// Syncs ONE content row: fetches fresh numbers, updates the live row,
// AND appends a permanent snapshot to analytics_history (never overwritten, never deleted).
async function syncContentRow(contentRow) {
  if (!contentRow.media_id) return; // needs media_id resolved first — see resolveMediaId()

  const stats = await fetchInsights(contentRow.media_id);

  await pool.query(
    `UPDATE content SET views=$1, likes=$2, comments=$3, shares=$4, last_synced_at=now() WHERE id=$5`,
    [stats.views, stats.likes, stats.comments, stats.shares, contentRow.id]
  );

  await pool.query(
    `INSERT INTO analytics_history (content_id, views, likes, comments, shares) VALUES ($1,$2,$3,$4,$5)`,
    [contentRow.id, stats.views, stats.likes, stats.comments, stats.shares]
  );
}

// Syncs every content row that has a resolved media_id. Call this from a
// scheduler (see server.js — node-cron, every few hours). Nothing here ever
// deletes rows; it only adds fresh rows to analytics_history over time.
async function syncAllContent() {
  const { rows } = await pool.query(`SELECT * FROM content WHERE media_id IS NOT NULL`);
  for (const row of rows) {
    try {
      await syncContentRow(row);
    } catch (err) {
      console.error(`فشل تحديث المحتوى #${row.id}:`, err.response?.data || err.message);
    }
  }
}

module.exports = { fetchInsights, syncContentRow, syncAllContent };
