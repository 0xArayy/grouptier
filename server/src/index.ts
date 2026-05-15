import path from 'path';
import { fileURLToPath } from 'url';
import { existsSync, readFileSync } from 'fs';
import Fastify from 'fastify';
import fastifyCors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import { sessionRoutes } from './routes/sessions.js';
import { pool } from './db/client.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Fail fast with a clear message instead of a cryptic crash
if (!process.env.BOT_TOKEN) {
  console.error('FATAL: BOT_TOKEN environment variable is not set.');
  process.exit(1);
}
if (!process.env.DATABASE_URL) {
  console.error('FATAL: DATABASE_URL environment variable is not set.');
  process.exit(1);
}
if (!process.env.MINI_APP_TGLINK) {
  console.error('FATAL: MINI_APP_TGLINK environment variable is not set (e.g. https://t.me/grouptier_bot/vote).');
  process.exit(1);
}

// Auto-initialize DB schema on every start (idempotent — uses IF NOT EXISTS)
const schemaPath = path.join(__dirname, '../../scripts/schema.sql');
if (existsSync(schemaPath)) {
  const sql = readFileSync(schemaPath, 'utf8');
  await pool.query(sql);
  console.log('✓ DB schema ready');
} else {
  console.warn('schema.sql not found — skipping auto-init');
}

// Import bot AFTER env check so grammy never gets an empty token
const { bot } = await import('./bot/bot.js');

const fastify = Fastify({ logger: true });

await fastify.register(fastifyCors, { origin: true });

// /health must be registered before static so it's never shadowed
fastify.get('/health', async () => ({ ok: true }));

await fastify.register(sessionRoutes);

// Serve React Mini App — only if dist exists
const frontendDist = path.join(__dirname, '../../frontend/dist');
if (existsSync(frontendDist)) {
  await fastify.register(fastifyStatic, {
    root: frontendDist,
    prefix: '/',
    decorateReply: false,
    wildcard: false,
  });
  fastify.get('/*', async (_req, reply) => {
    return reply.sendFile('index.html', frontendDist);
  });
} else {
  console.warn(`frontend/dist not found at ${frontendDist} — static serving disabled`);
}

const port = parseInt(process.env.PORT ?? '3000', 10);
await fastify.listen({ port, host: '0.0.0.0' });
console.log(`Server listening on port ${port}`);

bot.start({
  onStart: () => console.log('Bot polling started'),
});

process.once('SIGINT', () => bot.stop());
process.once('SIGTERM', () => bot.stop());
