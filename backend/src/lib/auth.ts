/**
 * Аутентификация запросов: заголовок X-Telegram-Init-Data.
 * preHandler валидирует initData, создаёт/обновляет пользователя в БД
 * и кладёт контекст в request.auth.
 */
import type { FastifyRequest } from 'fastify';
import { config } from '../config.js';
import type { UserRow } from '../types.js';
import { ensureUser } from '../services/pairs.js';
import { appErrors } from './errors.js';
import {
  validateInitData,
  type TelegramUser,
  type ValidatedInitData,
} from './telegram-auth.js';

export interface AuthContext {
  userId: number;
  user: UserRow;
  telegramUser: TelegramUser;
  initData: ValidatedInitData;
}

declare module 'fastify' {
  interface FastifyRequest {
    auth: AuthContext | null;
  }
}

function readHeader(request: FastifyRequest, name: string): string | null {
  const header = request.headers[name.toLowerCase()];
  if (typeof header === 'string') return header;
  if (Array.isArray(header)) return header[0] ?? null;
  return null;
}

/** Fastify preHandler для всех приватных маршрутов /api/*. */
export async function requireTelegramAuth(request: FastifyRequest): Promise<void> {
  const initData = readHeader(request, 'x-telegram-init-data');
  if (!initData) {
    throw appErrors.invalidInitData('Отсутствует заголовок X-Telegram-Init-Data');
  }

  const validated = validateInitData(
    initData,
    config.telegram.botToken,
    config.telegram.initDataMaxAgeSeconds,
  );

  const user = await ensureUser({
    id: validated.telegramUser.id,
    username: validated.telegramUser.username,
    firstName: validated.telegramUser.firstName,
    lastName: validated.telegramUser.lastName,
    avatarUrl: validated.telegramUser.avatarUrl,
  });

  request.auth = {
    userId: user.id,
    user,
    telegramUser: validated.telegramUser,
    initData: validated,
  };
}

/** Контекст авторизации; можно вызывать только после requireTelegramAuth. */
export function getAuth(request: FastifyRequest): AuthContext {
  if (!request.auth) {
    throw appErrors.invalidInitData('Запрос не авторизован');
  }
  return request.auth;
}
