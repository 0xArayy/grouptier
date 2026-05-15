import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';

const __dirname = dirname(fileURLToPath(import.meta.url));
const { Pool } = pg;

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const sql = readFileSync(join(__dirname, 'schema.sql'), 'utf8');

try {
  await pool.query(sql);
  console.log('✓ Database schema initialized');
} finally {
  await pool.end();
}
