import { existsSync } from 'node:fs';
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

// Schema migrations are NO LONGER run on every boot — doing so ran 27+ sequential
// DB round-trips before the server could listen, adding seconds to every (cold)
// start. Run them once per deploy via `npm run migrate`, or set RUN_MIGRATIONS=1
// to opt back into boot-time migration for a single run.
if (process.env.RUN_MIGRATIONS === '1' || process.env.RUN_MIGRATIONS === 'true') {
  const { runSchemaMigrations } = await import('./migrate.js');
  await runSchemaMigrations();
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

// Off the critical path: clean up stale sessions after we're already serving,
// so it never delays the first response on a cold start.
void import('./migrate.js')
  .then(({ cleanupStaleSessions }) => cleanupStaleSessions())
  .catch((err) => console.error('session cleanup failed:', err));

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
