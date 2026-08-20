// سيرفر واحد بيخدم الواجهة **و** الـAPI سوا — للتشغيل المحلي أو على Railway/Render.
// (على Netlify ما بينشغل هالملف — الـAPI بيمشي عبر netlify/functions/api.js)
const express = require('express');
const path = require('path');
const cron = require('node-cron');

const app = require('./app');
const { syncAllContent } = require('./services/metaSync');

// نفس السيرفر بيخدم الواجهة الأمامية كمان — يعني السيرفر الواحد هاد هو
// كل "البرنامج": الرابط الرئيسي بيفتح الداشبورد، و/api/* هو الـAPI.
app.use(express.static(path.join(__dirname, '../frontend')));
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

// Pulls fresh Meta numbers for every tracked Reel/Post/Story every 6 hours.
// This ONLY adds new rows to analytics_history — nothing is ever deleted here.
cron.schedule('0 */6 * * *', () => {
  console.log('⏳ مزامنة دورية مع Meta...');
  syncAllContent().catch((e) => console.error('فشلت المزامنة الدورية:', e.message));
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`✅ Najran Agency شغال بالكامل (واجهة + API) على المنفذ ${PORT}`));
