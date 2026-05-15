import 'dotenv/config';
import path from 'path';
import { fileURLToPath } from 'url';
import Fastify from 'fastify';
import fastifyCors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import { sessionRoutes } from './routes/sessions.js';
import { bot } from './bot/bot.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const fastify = Fastify({ logger: true });

await fastify.register(fastifyCors, { origin: true });
await fastify.register(sessionRoutes);

// Serve React Mini App static files
const frontendDist = path.join(__dirname, '../../frontend/dist');
await fastify.register(fastifyStatic, {
  root: frontendDist,
  prefix: '/',
  decorateReply: false,
});

// SPA fallback
fastify.get('/*', async (_req, reply) => {
  return reply.sendFile('index.html', frontendDist);
});

fastify.get('/health', async () => ({ ok: true }));

// T1: Fastify binds to PORT BEFORE grammy starts polling
const port = parseInt(process.env.PORT ?? '3000', 10);
await fastify.listen({ port, host: '0.0.0.0' });
console.log(`Server listening on port ${port}`);

// Start bot long-polling (no webhook config needed for hackathon)
bot.start({
  onStart: () => console.log('Bot polling started'),
});

process.once('SIGINT', () => bot.stop());
process.once('SIGTERM', () => bot.stop());
