/**
 * Единый формат ошибок API и маппинг ошибок PostgreSQL/Supabase.
 *
 * Клиент никогда не должен видеть SQL-текст: сообщения RPC (`LIMIT_REACHED`,
 * `PAIR_FULL` и т. п.) превращаются в понятные коды и HTTP-статусы.
 */
import { ZodError } from 'zod';
import type { Category } from '../types.js';

export type ApiErrorCode =
  | 'VALIDATION_ERROR'
  | 'INVALID_DATE'
  | 'INVALID_MOOD'
  | 'INVALID_INIT_DATA'
  | 'INIT_DATA_EXPIRED'
  | 'NO_PAIR'
  | 'NOT_PAIR_MEMBER'
  | 'PAIR_NOT_FOUND'
  | 'REMINDER_NOT_FOUND'
  | 'MATCH_NOT_FOUND'
  | 'PAIR_FULL'
  | 'ALREADY_IN_PAIR'
  | 'OWN_PAIR'
  | 'TRIAL_USED'
  | 'LIMIT_REACHED'
  | 'PAYMENT_CONFLICT'
  | 'RATE_LIMITED'
  | 'INTERNAL_ERROR';

export interface ErrorPayload {
  error: {
    code: ApiErrorCode;
    message: string;
    details?: Record<string, unknown>;
  };
}

export class AppError extends Error {
  readonly statusCode: number;
  readonly code: ApiErrorCode;
  readonly details: Record<string, unknown> | undefined;

  constructor(
    statusCode: number,
    code: ApiErrorCode,
    message: string,
    details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

export const appErrors = {
  invalidInitData: (message = 'Не удалось проверить данные Telegram. Переоткройте приложение.') =>
    new AppError(401, 'INVALID_INIT_DATA', message),
  initDataExpired: () =>
    new AppError(401, 'INIT_DATA_EXPIRED', 'Данные авторизации устарели. Переоткройте приложение.'),
  validation: (message = 'Проверьте правильность введённых данных', details?: Record<string, unknown>) =>
    new AppError(400, 'VALIDATION_ERROR', message, details),
  invalidDate: (message = 'Некорректная дата') => new AppError(400, 'INVALID_DATE', message),
  invalidMood: (message = 'Некорректное настроение') => new AppError(400, 'INVALID_MOOD', message),
  noPair: (message = 'Сначала создайте пару') => new AppError(403, 'NO_PAIR', message),
  notPairMember: (message = 'Нет доступа к данным этой пары') =>
    new AppError(403, 'NOT_PAIR_MEMBER', message),
  pairNotFound: (message = 'Пара не найдена') => new AppError(404, 'PAIR_NOT_FOUND', message),
  reminderNotFound: (message = 'Напоминание не найдено') =>
    new AppError(404, 'REMINDER_NOT_FOUND', message),
  matchNotFound: (message = 'Мэтч не найден') => new AppError(404, 'MATCH_NOT_FOUND', message),
  pairFull: (message = 'В этой паре уже есть два участника') =>
    new AppError(409, 'PAIR_FULL', message),
  alreadyInPair: (message = 'Вы уже состоите в паре') =>
    new AppError(409, 'ALREADY_IN_PAIR', message),
  ownPair: (message = 'Это ваша собственная ссылка-приглашение') =>
    new AppError(409, 'OWN_PAIR', message),
  trialUsed: (message = 'Пробный период уже использован') =>
    new AppError(409, 'TRIAL_USED', message),
  limitReached: (category: Category, limit: number) =>
    new AppError(409, 'LIMIT_REACHED', 'Дневной лимит исчерпан', { category, limit }),
  paymentConflict: (message = 'Платёж привязан к другой паре') =>
    new AppError(409, 'PAYMENT_CONFLICT', message),
  rateLimited: (message = 'Слишком много запросов. Попробуйте позже.') =>
    new AppError(429, 'RATE_LIMITED', message),
  internal: (message = 'Внутренняя ошибка сервера') => new AppError(500, 'INTERNAL_ERROR', message),
};

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}

interface DatabaseErrorLike {
  message?: string | null;
  details?: string | null;
  hint?: string | null;
}

/** Преобразует ошибку RPC/PostgREST в AppError с безопасным сообщением. */
export function mapDbError(error: DatabaseErrorLike): AppError {
  const message = (error.message ?? '').trim();
  const hint = (error.hint ?? '').trim();
  const normalized = message.toUpperCase();
  const limit = /^\d+$/.test(hint) ? Number(hint) : undefined;
  const limitDetails = limit !== undefined ? { limit } : undefined;

  if (normalized.includes('LIMIT_REACHED')) {
    return new AppError(409, 'LIMIT_REACHED', 'Дневной лимит исчерпан', limitDetails);
  }
  if (normalized.includes('TRIAL_USED')) {
    return appErrors.trialUsed();
  }
  if (normalized.includes('PAIR_FULL')) {
    return appErrors.pairFull();
  }
  if (normalized.includes('ALREADY_IN_PAIR')) {
    return appErrors.alreadyInPair();
  }
  if (normalized.includes('OWN_PAIR')) {
    return appErrors.ownPair();
  }
  if (normalized.includes('PAIR_NOT_FOUND')) {
    return appErrors.pairNotFound();
  }
  if (normalized.includes('REMINDER_NOT_FOUND')) {
    return appErrors.reminderNotFound();
  }
  if (normalized.includes('MATCH_NOT_FOUND')) {
    return appErrors.matchNotFound();
  }
  if (normalized.includes('NOT_REMINDER_RECEIVER')) {
    return appErrors.notPairMember('Это напоминание адресовано не вам');
  }
  if (normalized.includes('NO_PARTNER')) {
    return appErrors.noPair('Партнёр ещё не присоединился к пространству');
  }
  if (normalized.includes('NO_PAIR')) {
    return appErrors.noPair();
  }
  if (normalized.includes('INVALID_DATE')) {
    return appErrors.invalidDate();
  }
  if (normalized.includes('INVALID_MOOD')) {
    return appErrors.invalidMood();
  }
  if (normalized.includes('PAYMENT_CONFLICT')) {
    return appErrors.paymentConflict();
  }
  if (normalized.includes('USER_NOT_FOUND')) {
    return appErrors.invalidInitData('Пользователь не найден. Переоткройте приложение.');
  }
  if (normalized.includes('INVALID_')) {
    return appErrors.validation('Проверьте правильность введённых данных');
  }

  return appErrors.internal();
}

/** Любое исключение → AppError (для глобального обработчика). */
export function toAppError(error: unknown): AppError {
  if (error instanceof AppError) return error;
  if (error instanceof ZodError) {
    const issues = error.issues.map((issue) => ({
      path: issue.path.join('.'),
      message: issue.message,
    }));
    return appErrors.validation('Проверьте правильность введённых данных', { issues });
  }
  if (error instanceof SyntaxError) {
    return appErrors.validation('Некорректный JSON в запросе');
  }
  return appErrors.internal();
}

export function errorPayload(error: AppError): ErrorPayload {
  const payload: ErrorPayload = {
    error: {
      code: error.code,
      message: error.message,
    },
  };
  if (error.details !== undefined) {
    payload.error.details = error.details;
  }
  return payload;
}
