import type {
  AppState,
  Category,
  ContentResponse,
  FoodCard,
  MoodResponse,
  MovieCard,
  PaymentPlan,
  ReminderResponse,
  SessionResponse,
  StarsInvoiceResponse,
  StateResponse,
  SubscriptionSyncResponse,
  SwipeDirection,
  SwipeResponse,
} from '@/types/api';
import { getInitData } from './telegram';

const RAW_BASE_URL = (import.meta.env.VITE_API_URL ?? '').trim();
const API_BASE_URL = `${RAW_BASE_URL.replace(/\/+$/, '')}/api`;
const DEFAULT_TIMEOUT_MS = 20_000;

/** Коды, которые backend отдаёт в { error: { code, message, details } }. */
export type ApiErrorCode =
  | 'INVALID_INIT_DATA'
  | 'INIT_DATA_EXPIRED'
  | 'NO_PAIR'
  | 'NOT_PAIR_MEMBER'
  | 'PAIR_NOT_FOUND'
  | 'PAIR_FULL'
  | 'ALREADY_IN_PAIR'
  | 'OWN_PAIR'
  | 'TRIAL_USED'
  | 'LIMIT_REACHED'
  | 'PAYMENT_CONFLICT'
  | 'REMINDER_NOT_FOUND'
  | 'MATCH_NOT_FOUND'
  | 'VALIDATION_ERROR'
  | 'INVALID_DATE'
  | 'INVALID_MOOD'
  | 'RATE_LIMITED'
  | 'INTERNAL_ERROR'
  | 'NETWORK_ERROR'
  | 'TIMEOUT'
  | 'REQUEST_ABORTED'
  | 'INVALID_RESPONSE'
  | (string & {});

const FALLBACK_MESSAGES: Record<string, string> = {
  INVALID_INIT_DATA:
    'Не удалось подтвердить данные Telegram. Переоткройте приложение.',
  INIT_DATA_EXPIRED:
    'Сессия Telegram устарела. Закройте и снова откройте приложение.',
  NO_PAIR: 'Сначала создайте пространство для двоих.',
  NOT_PAIR_MEMBER: 'Вы не участник этой пары.',
  PAIR_NOT_FOUND: 'Приглашение не найдено. Проверьте код или ссылку.',
  PAIR_FULL: 'В этой паре уже двое — присоединиться нельзя.',
  ALREADY_IN_PAIR: 'Вы уже состоите в паре.',
  OWN_PAIR: 'Нельзя присоединиться к своей же паре.',
  TRIAL_USED: 'Пробный период уже использован.',
  LIMIT_REACHED:
    'Дневной лимит исчерпан. Откройте PRO, чтобы продолжить без ограничений.',
  PAYMENT_CONFLICT: 'Платёж уже привязан к другой паре.',
  REMINDER_NOT_FOUND: 'Напоминание не найдено.',
  MATCH_NOT_FOUND: 'Мэтч не найден.',
  VALIDATION_ERROR: 'Проверьте введённые данные.',
  INVALID_DATE: 'Дата указана неверно.',
  INVALID_MOOD: 'Не удалось распознать настроение.',
  RATE_LIMITED: 'Слишком много запросов. Подождите немного.',
  INTERNAL_ERROR: 'Что-то пошло не так. Попробуйте ещё раз.',
  NETWORK_ERROR:
    'Нет связи с сервером. Проверьте интернет и попробуйте ещё раз.',
  TIMEOUT: 'Сервер долго не отвечает. Попробуйте ещё раз.',
  REQUEST_ABORTED: 'Запрос отменён.',
  INVALID_RESPONSE: 'Сервер вернул неожиданный ответ. Попробуйте ещё раз.',
};

export class ApiError extends Error {
  readonly code: ApiErrorCode;
  readonly status: number;
  readonly details: Record<string, unknown> | undefined;

  constructor(
    code: ApiErrorCode,
    status: number,
    message: string,
    details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
    this.details = details;
  }

  get isAuthError(): boolean {
    return this.status === 401;
  }

  get isLimitReached(): boolean {
    return this.code === 'LIMIT_REACHED';
  }
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}

/** Человекочитаемое сообщение об ошибке — для тостов и inline-блоков. */
export function getErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.message.trim().length > 0) return error.message;
    return FALLBACK_MESSAGES[error.code] ?? 'Что-то пошло не так.';
  }
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }
  return 'Что-то пошло не так. Попробуйте ещё раз.';
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH';
  body?: unknown;
  signal?: AbortSignal;
  timeoutMs?: number;
}

interface ApiErrorEnvelope {
  error?: {
    code?: unknown;
    message?: unknown;
    details?: unknown;
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseErrorPayload(
  status: number,
  payload: unknown,
): ApiError {
  const envelope =
    isRecord(payload) && 'error' in payload
      ? (payload as ApiErrorEnvelope)
      : null;
  const rawError = envelope?.error;
  const rawCode = isRecord(rawError) ? rawError.code : undefined;
  const rawMessage = isRecord(rawError) ? rawError.message : undefined;
  const rawDetails = isRecord(rawError) ? rawError.details : undefined;

  const code: ApiErrorCode =
    typeof rawCode === 'string' && rawCode.length > 0
      ? rawCode
      : status === 401
        ? 'INVALID_INIT_DATA'
        : 'INTERNAL_ERROR';
  const message =
    typeof rawMessage === 'string' && rawMessage.trim().length > 0
      ? rawMessage
      : (FALLBACK_MESSAGES[code] ?? FALLBACK_MESSAGES.INTERNAL_ERROR);
  const details = isRecord(rawDetails) ? rawDetails : undefined;

  return new ApiError(code, status, message, details);
}

async function request<T>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const {
    method = 'GET',
    body,
    signal,
    timeoutMs = DEFAULT_TIMEOUT_MS,
  } = options;

  const controller = new AbortController();
  let timedOut = false;

  const timeoutId = window.setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  const handleExternalAbort = (): void => controller.abort();
  if (signal) {
    if (signal.aborted) controller.abort();
    else signal.addEventListener('abort', handleExternalAbort, { once: true });
  }

  const headers: Record<string, string> = { Accept: 'application/json' };
  const initData = getInitData();
  if (initData) headers['X-Telegram-Init-Data'] = initData;
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  try {
    const response = await fetch(`${API_BASE_URL}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
      cache: 'no-store',
      credentials: 'omit',
    });

    const rawText = await response.text();
    let payload: unknown;
    if (rawText.length > 0) {
      try {
        payload = JSON.parse(rawText) as unknown;
      } catch {
        payload = undefined;
      }
    }

    if (!response.ok) {
      throw parseErrorPayload(response.status, payload);
    }

    if (payload === undefined) {
      throw new ApiError(
        'INVALID_RESPONSE',
        response.status,
        FALLBACK_MESSAGES.INVALID_RESPONSE,
      );
    }

    return payload as T;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (timedOut) {
      throw new ApiError('TIMEOUT', 0, FALLBACK_MESSAGES.TIMEOUT);
    }
    if (controller.signal.aborted) {
      throw new ApiError(
        'REQUEST_ABORTED',
        0,
        FALLBACK_MESSAGES.REQUEST_ABORTED,
      );
    }
    throw new ApiError('NETWORK_ERROR', 0, FALLBACK_MESSAGES.NETWORK_ERROR);
  } finally {
    window.clearTimeout(timeoutId);
    if (signal) signal.removeEventListener('abort', handleExternalAbort);
  }
}

const STATE_PATH = '/state';

function normalizeLimit(limit: number): number {
  if (!Number.isFinite(limit)) return 30;
  return Math.min(Math.max(Math.floor(limit), 1), 50);
}

export const api = {
  createSession(): Promise<SessionResponse> {
    return request<SessionResponse>('/session', { method: 'POST', body: {} });
  },

  getState(): Promise<AppState> {
    return request<AppState>(STATE_PATH);
  },

  createPair(): Promise<StateResponse> {
    return request<StateResponse>('/pair/create', {
      method: 'POST',
      body: {},
    });
  },

  joinPair(inviteCode: string): Promise<StateResponse> {
    return request<StateResponse>('/pair/join', {
      method: 'POST',
      body: { inviteCode },
    });
  },

  leavePair(): Promise<StateResponse> {
    return request<StateResponse>('/pair/leave', {
      method: 'POST',
      body: {},
    });
  },

  updateProfile(displayName: string): Promise<StateResponse> {
    return request<StateResponse>('/profile', {
      method: 'PATCH',
      body: { displayName },
    });
  },

  setRelationshipDate(
    relationshipStartDate: string | null,
  ): Promise<StateResponse> {
    return request<StateResponse>('/pair/date', {
      method: 'PATCH',
      body: { relationshipStartDate },
    });
  },

  setMood(
    moodStatus: AppState['user']['moodStatus'],
    moodText: string | null,
  ): Promise<MoodResponse> {
    return request<MoodResponse>('/mood', {
      method: 'POST',
      body: { moodStatus, moodText },
    });
  },

  sendSwipe(payload: {
    category: Category;
    itemId: string;
    itemTitle: string;
    itemPoster?: string;
    direction: SwipeDirection;
  }): Promise<SwipeResponse> {
    return request<SwipeResponse>('/swipes', {
      method: 'POST',
      body: payload,
    });
  },

  completeMatch(
    matchId: string,
    isCompleted: boolean,
  ): Promise<StateResponse> {
    return request<StateResponse>(
      `/matches/${encodeURIComponent(matchId)}`,
      { method: 'PATCH', body: { isCompleted } },
    );
  },

  createReminder(
    text: string,
    remindAt: string | null,
  ): Promise<ReminderResponse> {
    return request<ReminderResponse>('/reminders', {
      method: 'POST',
      body: { text, remindAt },
    });
  },

  markReminderDone(reminderId: string): Promise<ReminderResponse> {
    return request<ReminderResponse>(
      `/reminders/${encodeURIComponent(reminderId)}/done`,
      { method: 'POST', body: {} },
    );
  },

  activateTrial(): Promise<StateResponse> {
    return request<StateResponse>('/subscription/trial', {
      method: 'POST',
      body: {},
    });
  },

  createStarsInvoice(plan: PaymentPlan): Promise<StarsInvoiceResponse> {
    return request<StarsInvoiceResponse>('/subscription/stars-invoice', {
      method: 'POST',
      body: { plan },
    });
  },

  syncSubscription(): Promise<SubscriptionSyncResponse> {
    return request<SubscriptionSyncResponse>('/subscription/sync', {
      method: 'POST',
      body: {},
      timeoutMs: 30_000,
    });
  },

  getMovies(limit = 30): Promise<ContentResponse<MovieCard>> {
    return request<ContentResponse<MovieCard>>(
      `/content/movies?limit=${normalizeLimit(limit)}`,
    );
  },

  getFood(limit = 30): Promise<ContentResponse<FoodCard>> {
    return request<ContentResponse<FoodCard>>(
      `/content/food?limit=${normalizeLimit(limit)}`,
    );
  },
};

export type ApiClient = typeof api;
