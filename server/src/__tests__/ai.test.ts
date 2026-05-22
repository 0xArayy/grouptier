import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';

// ── Mocks ──────────────────────────────────────────────────────────────────

const mockGenerateContent = vi.hoisted(() => vi.fn());

vi.mock('@google/generative-ai', () => ({
  GoogleGenerativeAI: class {
    getGenerativeModel() {
      return { generateContent: mockGenerateContent };
    }
  },
}));

let mockRejectAuth = false;
vi.mock('../middleware/initData.js', () => ({
  initDataMiddleware: async (req: { telegramUser: unknown; telegramChat: unknown }, reply: { status: (n: number) => { send: (b: unknown) => void } }) => {
    if (mockRejectAuth) {
      reply.status(401).send({ error: 'Missing initData' });
      return;
    }
    req.telegramUser = { id: 42, first_name: 'Test' };
    req.telegramChat = null;
  },
}));

// ── Helpers ────────────────────────────────────────────────────────────────

function geminiReturns(text: string) {
  mockGenerateContent.mockResolvedValue({ response: { text: () => text } });
}

async function buildApp(): Promise<FastifyInstance> {
  const fastify = Fastify();
  const { aiRoutes } = await import('../routes/ai.js');
  await fastify.register(aiRoutes);
  await fastify.ready();
  return fastify;
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('POST /api/ai/generate-options', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    vi.resetAllMocks();
    mockRejectAuth = false;
    mockGenerateContent.mockResolvedValue({ response: { text: () => '[]' } });
    app = await buildApp();
  });

  it('returns 401 when initData is missing', async () => {
    mockRejectAuth = true;
    const res = await app.inject({ method: 'POST', url: '/api/ai/generate-options', payload: { name: 'Test' } });
    expect(res.statusCode).toBe(401);
  });

  it('returns 400 when name is empty', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/ai/generate-options', payload: { name: '' } });
    expect(res.statusCode).toBe(400);
  });

  it('returns 400 when name is missing', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/ai/generate-options', payload: {} });
    expect(res.statusCode).toBe(400);
  });

  it('returns options for a valid clean JSON response', async () => {
    geminiReturns('["Python","JavaScript","Java","C++","Go","Rust","Swift","Kotlin"]');
    const res = await app.inject({ method: 'POST', url: '/api/ai/generate-options', payload: { name: 'Top languages' } });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.options).toHaveLength(8);
    expect(body.options[0]).toBe('Python');
  });

  it('extracts options from fenced JSON (```json ... ```)', async () => {
    geminiReturns('```json\n["Python","JavaScript","Java","C++","Go","Rust","Swift","Kotlin"]\n```');
    const res = await app.inject({ method: 'POST', url: '/api/ai/generate-options', payload: { name: 'Top languages' } });
    expect(res.statusCode).toBe(200);
    expect(res.json().options).toHaveLength(8);
  });

  it('extracts options when Gemini adds a preamble sentence', async () => {
    geminiReturns('Here are 8 options:\n["Python","JavaScript","Java","C++","Go","Rust","Swift","Kotlin"]');
    const res = await app.inject({ method: 'POST', url: '/api/ai/generate-options', payload: { name: 'Top languages' } });
    expect(res.statusCode).toBe(200);
    expect(res.json().options).toHaveLength(8);
  });

  it('filters out existingOptions case-insensitively', async () => {
    geminiReturns('["python","JavaScript","Java","C++","Go","Rust","Swift","Kotlin"]');
    const res = await app.inject({
      method: 'POST', url: '/api/ai/generate-options',
      payload: { name: 'Top languages', existingOptions: ['Python', 'JAVASCRIPT'] },
    });
    expect(res.statusCode).toBe(200);
    const options: string[] = res.json().options;
    expect(options).not.toContain('python');
    expect(options).not.toContain('JavaScript');
    expect(options.length).toBe(6);
  });

  it('trims options longer than 100 characters', async () => {
    const longOption = 'A'.repeat(120);
    geminiReturns(`["${longOption}","B","C","D","E","F","G","H"]`);
    const res = await app.inject({ method: 'POST', url: '/api/ai/generate-options', payload: { name: 'Test' } });
    expect(res.statusCode).toBe(200);
    const options: string[] = res.json().options;
    expect(options[0].length).toBe(100);
  });

  it('retries once on invalid JSON and succeeds on second attempt', async () => {
    mockGenerateContent
      .mockResolvedValueOnce({ response: { text: () => 'not valid json at all' } })
      .mockResolvedValueOnce({ response: { text: () => '["A","B","C","D","E","F","G","H"]' } });
    const res = await app.inject({ method: 'POST', url: '/api/ai/generate-options', payload: { name: 'Test' } });
    expect(res.statusCode).toBe(200);
    expect(mockGenerateContent).toHaveBeenCalledTimes(2);
  });

  it('returns 502 after two failed parse attempts', async () => {
    geminiReturns('not json at all');
    const res = await app.inject({ method: 'POST', url: '/api/ai/generate-options', payload: { name: 'Test' } });
    expect(res.statusCode).toBe(502);
    expect(mockGenerateContent).toHaveBeenCalledTimes(2);
  });

  it('returns fewer than 8 options when all are filtered by existingOptions', async () => {
    geminiReturns('["Python","JavaScript","Java","C++","Go","Rust","Swift","Kotlin"]');
    const res = await app.inject({
      method: 'POST', url: '/api/ai/generate-options',
      payload: { name: 'Test', existingOptions: ['Python','JavaScript','Java','C++','Go','Rust'] },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().options.length).toBe(2);
  });
});
