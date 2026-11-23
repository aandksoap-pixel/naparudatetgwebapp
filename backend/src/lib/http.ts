/**
 * Минимальный HTTP-клиент для внешних API (TMDB, ЮKassa).
 * Работает поверх глобального fetch, с таймаутом и разбором JSON.
 */
export class HttpError extends Error {
  readonly status: number;
  readonly body: unknown;

  constructor(status: number, message: string, body: unknown) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.body = body;
  }
}

export interface HttpRequestOptions {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 10_000;

export async function fetchJson<T>(url: string, options: HttpRequestOptions = {}): Promise<T> {
  const controller = new AbortController();
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      method: options.method ?? 'GET',
      headers: options.headers,
      body: options.body,
      signal: controller.signal,
    });

    const rawText = await response.text();
    let parsed: unknown = null;
    if (rawText.length > 0) {
      try {
        parsed = JSON.parse(rawText) as unknown;
      } catch {
        parsed = rawText;
      }
    }

    if (!response.ok) {
      const description =
        typeof parsed === 'object' && parsed !== null && 'description' in parsed
          ? String((parsed as Record<string, unknown>).description)
          : `HTTP ${response.status}`;
      throw new HttpError(response.status, description, parsed);
    }

    return parsed as T;
  } finally {
    clearTimeout(timer);
  }
}
