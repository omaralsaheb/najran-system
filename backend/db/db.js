const { Pool } = require('pg');

// DATABASE_URL comes from your hosting provider (Railway/Render/Supabase all give you one)
// Example: postgres://user:password@host:5432/dbname
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL && process.env.DATABASE_URL.includes('localhost')
    ? false
    : { rejectUnauthorized: false },
});

module.exports = pool;
