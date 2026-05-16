import { createHmac } from 'crypto';
import type { FastifyRequest, FastifyReply } from 'fastify';

export interface TelegramUser {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
}

export interface TelegramChat {
  id: number;
  type: string;
  title?: string;
}

declare module 'fastify' {
  interface FastifyRequest {
    telegramUser: TelegramUser;
    telegramChat: TelegramChat | null;
  }
}

interface ValidatedInitData {
  user: TelegramUser;
  chat: TelegramChat | null;
}

function validateInitData(initData: string, botToken: string): ValidatedInitData | null {
  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash) return null;

  params.delete('hash');
  const entries = [...params.entries()].sort(([a], [b]) => a.localeCompare(b));
  const dataCheckString = entries.map(([k, v]) => `${k}=${v}`).join('\n');

  const secretKey = createHmac('sha256', 'WebAppData').update(botToken).digest();
  const expectedHash = createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

  if (expectedHash !== hash) return null;

  const userRaw = params.get('user');
  if (!userRaw) return null;

  let user: TelegramUser;
  try {
    user = JSON.parse(userRaw) as TelegramUser;
  } catch {
    return null;
  }

  let chat: TelegramChat | null = null;
  const chatRaw = params.get('chat');
  if (chatRaw) {
    try {
      chat = JSON.parse(chatRaw) as TelegramChat;
    } catch {
      // ignore malformed chat field
    }
  }

  return { user, chat };
}

export async function initDataMiddleware(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const botToken = process.env.BOT_TOKEN;
  if (!botToken) {
    reply.status(500).send({ error: 'Server misconfigured' });
    return;
  }

  const body = request.body as Record<string, unknown> | undefined;
  const initData = (request.headers['x-init-data'] as string) || (body?.initData as string | undefined);
  if (!initData) {
    reply.status(401).send({ error: 'Missing initData' });
    return;
  }

  // Allow bypass in dev mode with a fake user
  if (process.env.NODE_ENV !== 'production' && initData === 'dev') {
    request.telegramUser = { id: 1, first_name: 'Dev' };
    request.telegramChat = { id: -1001234567890, type: 'supergroup', title: 'Dev Group' };
    return;
  }

  const result = validateInitData(initData, botToken);
  if (!result) {
    reply.status(401).send({ error: 'Invalid initData' });
    return;
  }

  request.telegramUser = result.user;
  request.telegramChat = result.chat;
}
