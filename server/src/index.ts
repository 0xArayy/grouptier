import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fastifyCors from '@fastify/cors';
import fastifyRateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import fastifyWebsocket from '@fastify/websocket';
import Fastify from 'fastify';
import { closeCardPool } from './bot/imageCard.js';
import { pool } from './db/client.js';
import { aiRoutes } from './routes/ai.js';
import { publicPollRoutes } from './routes/publicPolls.js';
import { savedPollRoutes } from './routes/savedPolls.js';
import { sessionRoutes } from './routes/sessions.js';
import { templateRoutes } from './routes/templates.js';
import { wsRoutes } from './routes/ws.js';

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
  console.error(
    'FATAL: MINI_APP_TGLINK environment variable is not set (e.g. https://t.me/grouptier_bot/vote).',
  );
  process.exit(1);
}
if (!process.env.GROQ_API_KEY) {
  console.error('FATAL: GROQ_API_KEY is not set.');
  process.exit(1);
}

// Auto-initialize DB schema on every start (idempotent — uses IF NOT EXISTS).
// Each statement is run independently so a harmless failure on one (e.g. an
// ALTER that references a table created by an earlier ad-hoc migration) does
// not abort the rest of the batch.
const schemaPath = path.join(__dirname, '../../scripts/schema.sql');
if (existsSync(schemaPath)) {
  const sql = readFileSync(schemaPath, 'utf8');
  // Split on statement boundaries; filter out blank/comment-only entries.
  const stmts = sql
    .split(/;[ \t]*(\r?\n|$)/)
    .map((s) => s.trim())
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
} else {
  console.warn('schema.sql not found — skipping auto-init');
}

// Clean up abandoned collecting sessions and half-open voting sessions older than 24 h.
// collecting: stranded sessions block new session creation (unique index).
// voting+message_sent=false: server crashed between status flip and sendMessage — never got a bot message.
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

// Import bot AFTER env check so grammy never gets an empty token
const { bot } = await import('./bot/bot.js');

// Prevent Telegram initData from appearing in access logs (it's passed as a
// query param for WebSocket upgrades and is a short-lived auth credential).
const fastify = Fastify({
  logger: {
    serializers: {
      req(req) {
        return {
          method: req.method,
          url: (req.url as string).replace(/([?&])initData=[^&]*/g, '$1initData=[REDACTED]'),
        };
      },
    },
  },
});

const allowedOrigin = process.env.ALLOWED_ORIGIN;
if (!allowedOrigin && process.env.NODE_ENV === 'production') {
  console.warn('WARNING: ALLOWED_ORIGIN is not set — CORS is open to all origins');
}
await fastify.register(fastifyCors, { origin: allowedOrigin ?? true });

await fastify.register(fastifyRateLimit, {
  global: true,
  max: 100,
  timeWindow: '1 minute',
  keyGenerator: (req) => req.ip,
  errorResponseBuilder: () => ({ error: 'Too many requests, please try again later' }),
});

// /health must be registered before static so it's never shadowed
fastify.get('/health', async () => ({ ok: true }));

await fastify.register(fastifyWebsocket);
await fastify.register(sessionRoutes);
await fastify.register(savedPollRoutes);
await fastify.register(publicPollRoutes);
await fastify.register(aiRoutes);
await fastify.register(templateRoutes);
await fastify.register(wsRoutes);

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

async function shutdown(signal: string) {
  console.log(`${signal} received — shutting down gracefully`);
  bot.stop();
  await fastify.close();
  await closeCardPool();
  await pool.end();
  process.exit(0);
}

process.once('SIGINT', () => void shutdown('SIGINT'));
process.once('SIGTERM', () => void shutdown('SIGTERM'));
