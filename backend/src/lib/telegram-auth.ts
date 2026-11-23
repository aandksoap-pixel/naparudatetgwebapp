/**
 * Валидация Telegram WebApp initData (HMAC-SHA256) и извлечение профиля.
 *
 * Алгоритм из документации Telegram:
 *   secret_key = HMAC_SHA256(key="WebAppData", data=BOT_TOKEN)
 *   hash       = HMAC_SHA256(key=secret_key, data=data_check_string)
 * где data_check_string — отсортированные по ключу пары `key=value` через \n.
 * Сравнение подписи — timing-safe.
 */
import { createHmac } from 'node:crypto';
import { appErrors } from './errors.js';
import { safeCompare } from './html.js';

export interface TelegramUser {
  id: number;
  username: string | null;
  firstName: string;
  lastName: string | null;
  avatarUrl: string | null;
  languageCode: string | null;
}

export interface ValidatedInitData {
  telegramUser: TelegramUser;
  authDate: number;
  queryId: string | null;
  startParam: string | null;
}

const MAX_NAME_LENGTH = 64;

function pickString(source: Record<string, unknown>, key: string): string | null {
  const value = source[key];
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function parseTelegramUser(rawUser: string): TelegramUser {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawUser) as unknown;
  } catch {
    throw appErrors.invalidInitData('Не удалось разобрать данные пользователя Telegram');
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw appErrors.invalidInitData('Некорректные данные пользователя Telegram');
  }
  const source = parsed as Record<string, unknown>;
  const rawId = source.id;
  const id =
    typeof rawId === 'number'
      ? rawId
      : typeof rawId === 'string'
        ? Number.parseInt(rawId, 10)
        : Number.NaN;
  if (!Number.isInteger(id) || id <= 0) {
    throw appErrors.invalidInitData('В данных Telegram нет корректного id пользователя');
  }
  const firstName = pickString(source, 'first_name') ?? 'Пользователь';
  const lastName = pickString(source, 'last_name');
  const username = pickString(source, 'username');
  const avatarUrl = pickString(source, 'photo_url');
  const languageCode = pickString(source, 'language_code');

  return {
    id,
    username,
    firstName: firstName.slice(0, MAX_NAME_LENGTH),
    lastName: lastName ? lastName.slice(0, MAX_NAME_LENGTH) : null,
    avatarUrl,
    languageCode,
  };
}

/**
 * Проверяет подпись initData и возвращает профиль пользователя.
 * Бросает AppError 401 (INVALID_INIT_DATA / INIT_DATA_EXPIRED).
 */
export function validateInitData(
  initData: string,
  botToken: string,
  maxAgeSeconds: number,
): ValidatedInitData {
  if (typeof initData !== 'string' || initData.trim().length === 0) {
    throw appErrors.invalidInitData('Отсутствуют данные авторизации Telegram');
  }

  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash) {
    throw appErrors.invalidInitData('В данных авторизации Telegram нет подписи');
  }

  const entries: string[] = [];
  for (const [key, value] of params.entries()) {
    if (key === 'hash') continue;
    entries.push(`${key}=${value}`);
  }
  if (entries.length === 0) {
    throw appErrors.invalidInitData('Пустые данные авторизации Telegram');
  }
  entries.sort();
  const dataCheckString = entries.join('\n');

  const secretKey = createHmac('sha256', 'WebAppData').update(botToken).digest();
  const calculatedHash = createHmac('sha256', secretKey)
    .update(dataCheckString)
    .digest('hex');

  if (!safeCompare(calculatedHash, hash.toLowerCase())) {
    throw appErrors.invalidInitData('Подпись Telegram неверна. Переоткройте приложение.');
  }

  const authDateRaw = params.get('auth_date');
  const authDate = authDateRaw ? Number.parseInt(authDateRaw, 10) : Number.NaN;
  if (!Number.isFinite(authDate)) {
    throw appErrors.invalidInitData('В данных авторизации Telegram нет auth_date');
  }
  const nowSeconds = Math.floor(Date.now() / 1000);
  if (nowSeconds - authDate > maxAgeSeconds) {
    throw appErrors.initDataExpired();
  }
  // Небольшой допуск на расхождение часов серверов.
  if (authDate > nowSeconds + 300) {
    throw appErrors.invalidInitData('Некорректная дата авторизации Telegram');
  }

  const rawUser = params.get('user');
  if (!rawUser) {
    throw appErrors.invalidInitData('В данных авторизации Telegram нет пользователя');
  }

  const startParamRaw = params.get('start_param');

  return {
    telegramUser: parseTelegramUser(rawUser),
    authDate,
    queryId: params.get('query_id'),
    startParam: startParamRaw && startParamRaw.trim().length > 0 ? startParamRaw.trim() : null,
  };
}
