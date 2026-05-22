import type { FastifyInstance } from 'fastify';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { initDataMiddleware } from '../middleware/initData.js';

const MAX_OPTION_LENGTH = 100;
const GEMINI_MODEL = 'gemini-2.0-flash-lite';
const SYSTEM_INSTRUCTION =
  'You generate options for a GroupTier voting poll. Output ONLY a JSON array of exactly 8 strings. ' +
  'Each option max 60 chars. No duplicates. Match the language of the poll title.';

function parseOptions(text: string, existingLower: Set<string>): string[] {
  const match = text.match(/\[[\s\S]*\]/);
  if (!match) return [];
  let arr: unknown;
  try { arr = JSON.parse(match[0]); } catch { return []; }
  if (!Array.isArray(arr)) return [];
  return (arr as unknown[])
    .filter((o): o is string => typeof o === 'string')
    .map(o => o.slice(0, MAX_OPTION_LENGTH).trim())
    .filter(o => o.length > 0 && !existingLower.has(o.toLowerCase()));
}

export async function aiRoutes(fastify: FastifyInstance) {
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
  const gemini = genAI.getGenerativeModel({
    model: GEMINI_MODEL,
    systemInstruction: SYSTEM_INSTRUCTION,
    generationConfig: { temperature: 0.8, maxOutputTokens: 400 },
  });

  fastify.post<{ Body: { name?: string; existingOptions?: unknown } }>(
    '/api/ai/generate-options',
    { preHandler: initDataMiddleware },
    async (request, reply) => {
      const name = (request.body?.name ?? '').trim();
      if (!name) return reply.status(400).send({ error: 'name is required' });

      const existing = Array.isArray(request.body?.existingOptions)
        ? (request.body.existingOptions as unknown[]).filter((o): o is string => typeof o === 'string')
        : [];
      const existingLower = new Set(existing.map(o => o.toLowerCase()));

      const prompt = existing.length > 0
        ? `Poll: "${name}". Already has: ${existing.map(o => `"${o}"`).join(', ')}. Generate 8 more options, don't repeat them.`
        : `Poll: "${name}". Generate 8 options.`;

      for (let attempt = 0; attempt < 2; attempt++) {
        const result = await gemini.generateContent(prompt);
        const options = parseOptions(result.response.text(), existingLower);
        if (options.length > 0) return reply.send({ options });
      }

      return reply.status(502).send({ error: 'AI did not return valid options' });
    },
  );
}
