import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';

// ── Mocks ──────────────────────────────────────────────────────────────────

const mockFetch = vi.fn();

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

function groqReturns(content: string) {
  mockFetch.mockResolvedValue({
    ok: true,
    json: () => Promise.resolve({ choices: [{ message: { content } }] }),
  });
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
    vi.stubGlobal('fetch', mockFetch);
    mockRejectAuth = false;
    groqReturns('[]');
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
    groqReturns('["Python","JavaScript","Java","C++","Go","Rust","Swift","Kotlin"]');
    const res = await app.inject({ method: 'POST', url: '/api/ai/generate-options', payload: { name: 'Top languages' } });
    expect(res.statusCode).toBe(200);
    expect(res.json().options).toHaveLength(8);
    expect(res.json().options[0]).toBe('Python');
  });

  it('extracts options from fenced JSON (```json ... ```)', async () => {
    groqReturns('```json\n["Python","JavaScript","Java","C++","Go","Rust","Swift","Kotlin"]\n```');
    const res = await app.inject({ method: 'POST', url: '/api/ai/generate-options', payload: { name: 'Top languages' } });
    expect(res.statusCode).toBe(200);
    expect(res.json().options).toHaveLength(8);
  });

  it('extracts options when model adds a preamble sentence', async () => {
    groqReturns('Here are 8 options:\n["Python","JavaScript","Java","C++","Go","Rust","Swift","Kotlin"]');
    const res = await app.inject({ method: 'POST', url: '/api/ai/generate-options', payload: { name: 'Top languages' } });
    expect(res.statusCode).toBe(200);
    expect(res.json().options).toHaveLength(8);
  });

  it('filters out existingOptions case-insensitively', async () => {
    groqReturns('["python","JavaScript","Java","C++","Go","Rust","Swift","Kotlin"]');
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
    groqReturns(`["${longOption}","B","C","D","E","F","G","H"]`);
    const res = await app.inject({ method: 'POST', url: '/api/ai/generate-options', payload: { name: 'Test' } });
    expect(res.statusCode).toBe(200);
    expect((res.json().options as string[])[0].length).toBe(100);
  });

  it('retries once on invalid JSON and succeeds on second attempt', async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ choices: [{ message: { content: 'not json' } }] }) })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ choices: [{ message: { content: '["A","B","C","D","E","F","G","H"]' } }] }) });
    const res = await app.inject({ method: 'POST', url: '/api/ai/generate-options', payload: { name: 'Test' } });
    expect(res.statusCode).toBe(200);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('returns 502 after two failed parse attempts', async () => {
    groqReturns('not json at all');
    const res = await app.inject({ method: 'POST', url: '/api/ai/generate-options', payload: { name: 'Test' } });
    expect(res.statusCode).toBe(502);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('returns fewer than 8 options when all are filtered by existingOptions', async () => {
    groqReturns('["Python","JavaScript","Java","C++","Go","Rust","Swift","Kotlin"]');
    const res = await app.inject({
      method: 'POST', url: '/api/ai/generate-options',
      payload: { name: 'Test', existingOptions: ['Python','JavaScript','Java','C++','Go','Rust'] },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().options.length).toBe(2);
  });
});
