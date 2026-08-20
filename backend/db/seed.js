// شغّل هاد مرة وحدة بس بعد ما تجهز قاعدة البيانات: node db/seed.js
// بينشئ أول حساب CEO تلقائياً (ما بيلمس شي إذا كان في موظفين مسجلين أصلاً)
require('dotenv').config();
const bcrypt = require('bcryptjs');
const pool = require('./db');

const EMAIL = 'admin@najranagency.com';
const PASSWORD = 'Najran@2026'; // ⚠️ غيّرها فوراً بعد أول تسجيل دخول

(async () => {
  const existing = await pool.query('SELECT id FROM employees LIMIT 1');
  if (existing.rows.length > 0) {
    console.log('في موظفين مسجلين أصلاً — ما رح ننشئ حساب جديد. صفّي جدول employees لو بدك تعيد التجربة.');
    process.exit(0);
  }

  const role = await pool.query("SELECT id FROM roles WHERE key = 'ceo'");
  if (role.rows.length === 0) {
    console.error('جدول roles فاضي — شغّل db/schema.sql الأول.');
    process.exit(1);
  }

  const hash = await bcrypt.hash(PASSWORD, 10);
  await pool.query(
    'INSERT INTO employees (name, email, password_hash, role_id) VALUES ($1,$2,$3,$4)',
    ['انس هليل', EMAIL, hash, role.rows[0].id]
  );

  console.log('============================================================');
  console.log('✅ تم إنشاء أول حساب مدير:');
  console.log(`   البريد:      ${EMAIL}`);
  console.log(`   كلمة السر:   ${PASSWORD}`);
  console.log('   ⚠️  سجل دخول وغيّرها فوراً');
  console.log('============================================================');
  process.exit(0);
})().catch((err) => { console.error(err); process.exit(1); });
