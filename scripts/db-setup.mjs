// Applies db/schema.sql to DATABASE_URL. Run: npm run db:setup
import { readFileSync } from 'node:fs';
import { Pool } from '@neondatabase/serverless';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL is not set (put it in .env.local).');
  process.exit(1);
}

const sql = readFileSync(new URL('../db/schema.sql', import.meta.url), 'utf8');
const pool = new Pool({ connectionString: url });
try {
  await pool.query(sql);
  const { rows } = await pool.query(
    "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY 1",
  );
  console.log('Schema applied. Tables:', rows.map(r => r.table_name).join(', '));
} finally {
  await pool.end();
}
