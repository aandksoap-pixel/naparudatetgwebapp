/**
 * Проверка обязательной подписки на Telegram-канал.
 * Бот должен быть администратором канала, иначе getChatMember вернёт ошибку.
 * При ошибке Telegram API доступ не блокируем (fail-open), чтобы настройка
 * канала не ложила всё приложение; ошибка логируется.
 */
import { Api } from 'grammy';
import { config } from '../config.js';
import { logger } from './logger.js';

const api = new Api(config.telegram.botToken);
const CACHE_TTL_MS = 15_000;
const cache = new Map<number, { allowed: boolean; expiresAt: number }>();

export function isChannelGateEnabled(): boolean {
  return Boolean(config.telegram.requiredChannel);
}

export function requiredChannelUrl(): string | null {
  return config.telegram.channelUrl;
}

export async function isSubscribedToRequiredChannel(
  userId: number,
  force = false,
): Promise<boolean> {
  const channel = config.telegram.requiredChannel;
  if (!channel) return true;

  const cached = cache.get(userId);
  if (!force && cached && cached.expiresAt > Date.now()) {
    return cached.allowed;
  }

  try {
    const member = await api.getChatMember(channel, userId);
    const allowed =
      member.status === 'creator' ||
      member.status === 'administrator' ||
      member.status === 'member' ||
      (member.status === 'restricted' && member.is_member === true);

    cache.set(userId, { allowed, expiresAt: Date.now() + CACHE_TTL_MS });
    return allowed;
  } catch (error) {
    logger.warn(
      { err: error, channel, userId },
      'Не удалось проверить подписку на канал — доступ разрешён (fail-open)',
    );
    return true;
  }
}
