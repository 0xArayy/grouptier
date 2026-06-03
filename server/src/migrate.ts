import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { pool } from './db/client.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Apply the DB schema (idempotent — uses IF NOT EXISTS). Each statement is run
 * independently so a harmless failure on one (e.g. an ALTER that references a
 * table created by an earlier ad-hoc migration) does not abort the rest.
 *
 * This is intentionally NOT run on every server boot — see index.ts. Running 27+
 * sequential DB round-trips before the server can listen added seconds to every
 * cold start. Run it once per deploy via `npm run migrate` (or RUN_MIGRATIONS=1).
 */
export async function runSchemaMigrations(): Promise<void> {
  const schemaPath = path.join(__dirname, '../../scripts/schema.sql');
  if (!existsSync(schemaPath)) {
    console.warn('schema.sql not found — skipping migrations');
    return;
  }
  const sql = readFileSync(schemaPath, 'utf8');
  // Split on statement boundaries; filter out blank/comment-only entries.
  // Strip leading comment lines before the check so that statements preceded
  // by a "-- comment" block are not incorrectly discarded.
  const stmts = sql
    .split(/;[ \t]*(\r?\n|$)/)
    .map((s) => s.replace(/^(\s*--[^\n]*\n)*/g, '').trim())
    .filter((s) => s.length > 0 && !s.startsWith('--'));
  let ok = 0;
  let skipped = 0;
  for (const stmt of stmts) {
    try {
      await pool.query(stmt);
      ok++;
    } catch (err) {
      // Log but continue — idempotent migrations tolerate partial pre-existing state.
      console.warn(`schema stmt skipped (${(err as Error).message.split('\n')[0]})`);
      skipped++;
    }
  }
  console.log(`✓ DB schema ready (${ok} ok, ${skipped} skipped)`);
}

/**
 * Clean up abandoned collecting sessions and half-open voting sessions older than 24 h.
 * - collecting: stranded sessions block new session creation (unique index).
 * - voting+message_sent=false: server crashed between status flip and sendMessage.
 *
 * Cheap, but kept off the boot critical path — index.ts fires this after listen.
 */
export async function cleanupStaleSessions(): Promise<void> {
  const cleaned = await pool.query(
    `DELETE FROM sessions
     WHERE created_at < NOW() - INTERVAL '24 hours'
       AND (
         status = 'collecting'
         OR (status = 'voting' AND message_sent = false)
       )
     RETURNING id`,
  );
  if (cleaned.rowCount && cleaned.rowCount > 0) {
    console.log(`✓ Cleaned up ${cleaned.rowCount} stranded session(s)`);
  }
}

// CLI entry: `node dist/migrate.js` runs schema + cleanup once, then exits.
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  runSchemaMigrations()
    .then(() => cleanupStaleSessions())
    .then(() => pool.end())
    .then(() => {
      console.log('✓ migrate complete');
      process.exit(0);
    })
    .catch((err) => {
      console.error('migrate failed:', err);
      process.exit(1);
    });
}
