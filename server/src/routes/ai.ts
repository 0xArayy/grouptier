import type { FastifyInstance } from 'fastify';
import { MAX_NAME_LENGTH, MAX_OPTION_TEXT_LENGTH } from '../lib/constants.js';
import { initDataMiddleware } from '../middleware/initData.js';

const GROQ_MODEL = 'llama-3.3-70b-versatile';
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const SYSTEM_INSTRUCTION =
  'You generate voting options for a GroupTier poll where users rank choices.\n\n' +
  'OUTPUT FORMAT: a single valid JSON array of exactly 12 strings. ' +
  'Nothing else — no markdown fences, no explanation, no extra text.\n\n' +
  'LANGUAGE: detect the language of the poll title and write EVERY option in that exact language. ' +
  'If the title is Russian — all 12 options must be in Russian. ' +
  'If the title is English — all in English. Never mix languages.\n\n' +
  'OPTION QUALITY: options are concrete CHOICES users pick between — not background context. ' +
  'Example: for "что взять на море" generate "солнцезащитный крем", "полотенце", "очки" — ' +
  'NOT "песок", "солнце", "море" (those are context, not choices). ' +
  'Each option: max 60 characters, specific, realistic, directly relevant to the question. ' +
  'No duplicates or near-duplicates.';

function parseOptions(text: string, existingLower: Set<string>): string[] {
  const match = text.match(/\[[\s\S]*\]/);
  if (!match) return [];
  let arr: unknown;
  try {
    arr = JSON.parse(match[0]);
  } catch {
    return [];
  }
  if (!Array.isArray(arr)) return [];
  return (arr as unknown[])
    .filter((o): o is string => typeof o === 'string')
    .map((o) => o.slice(0, MAX_OPTION_TEXT_LENGTH).trim())
    .filter((o) => o.length > 0 && !existingLower.has(o.toLowerCase()));
}

async function callGroq(prompt: string, apiKey: string): Promise<string> {
  const res = await fetch(GROQ_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: GROQ_MODEL,
      messages: [
        { role: 'system', content: SYSTEM_INSTRUCTION },
        { role: 'user', content: prompt },
      ],
      temperature: 0.8,
      max_tokens: 600,
    }),
  });
  if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
  const data = (await res.json()) as { choices: { message: { content: string } }[] };
  return data.choices[0].message.content;
}

export async function aiRoutes(fastify: FastifyInstance) {
  fastify.post<{ Body: { name?: string; existingOptions?: unknown } }>(
    '/api/ai/generate-options',
    { preHandler: initDataMiddleware, config: { rateLimit: { max: 3, timeWindow: '1 minute' } } },
    async (request, reply) => {
      const name = (request.body?.name ?? '').trim();
      if (!name) return reply.status(400).send({ error: 'name is required' });
      if (name.length > MAX_NAME_LENGTH) return reply.status(400).send({ error: 'name is too long' });

      const existing = Array.isArray(request.body?.existingOptions)
        ? (request.body.existingOptions as unknown[]).filter((o): o is string => typeof o === 'string')
        : [];
      const existingLower = new Set(existing.map((o) => o.toLowerCase()));

      const prompt =
        existing.length > 0
          ? `Poll title: "${name}"\nAlready added: ${existing.map((o) => `"${o}"`).join(', ')}\nGenerate exactly 12 more options. Do not repeat or semantically duplicate any already added.`
          : `Poll title: "${name}"\nGenerate exactly 12 options.`;

      for (let attempt = 0; attempt < 2; attempt++) {
        const text = await callGroq(prompt, process.env.GROQ_API_KEY!);
        const options = parseOptions(text, existingLower);
        if (options.length > 0) return reply.send({ options });
      }

      return reply.status(502).send({ error: 'AI did not return valid options' });
    },
  );
}
