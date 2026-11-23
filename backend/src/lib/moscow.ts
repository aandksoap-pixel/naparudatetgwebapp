/**
 * Работа с московской календарной датой.
 *
 * Дневные лимиты в SQL считаются по `app_moscow_today()` (Europe/Moscow).
 * Здесь — вызов этой функции и локальный fallback на случай недоступности БД,
 * чтобы state всё равно можно было собрать.
 */
import { callRpc } from './supabase.js';

const MOSCOW_TIME_ZONE = 'Europe/Moscow';
const DAY_MS = 24 * 60 * 60 * 1000;

const moscowDateFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: MOSCOW_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** Возвращает YYYY-MM-DD для указанного момента в Europe/Moscow. */
export function moscowDateString(date: Date = new Date()): string {
  const parts = moscowDateFormatter.formatToParts(date);
  const year = parts.find((part) => part.type === 'year')?.value ?? '';
  const month = parts.find((part) => part.type === 'month')?.value ?? '';
  const day = parts.find((part) => part.type === 'day')?.value ?? '';
  if (year && month && day) {
    return `${year}-${month}-${day}`;
  }
  // UTC+3 фиксирован для Москвы — надёжный резервный вариант.
  return new Date(date.getTime() + 3 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/** Сегодняшняя дата по Москве. Источник истины — RPC app_moscow_today(). */
export async function getMoscowToday(): Promise<string> {
  try {
    const today = await callRpc<string | null>('app_moscow_today', {});
    if (typeof today === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(today)) {
      return today;
    }
    return moscowDateString();
  } catch {
    return moscowDateString();
  }
}

/** YYYY-MM-DD → количество дней между датами (может быть отрицательным). */
export function diffInDays(fromDate: string, toDate: string): number | null {
  const fromMs = Date.parse(`${fromDate}T00:00:00Z`);
  const toMs = Date.parse(`${toDate}T00:00:00Z`);
  if (!Number.isFinite(fromMs) || !Number.isFinite(toMs)) return null;
  return Math.floor((toMs - fromMs) / DAY_MS);
}

/** «Вместе N дней»: не меньше нуля, null если дата не задана. */
export function daysTogether(startDate: string | null, today: string): number | null {
  if (!startDate) return null;
  const diff = diffInDays(startDate, today);
  if (diff === null) return null;
  return Math.max(0, diff);
}

/** Проверяет, что строка — существующая календарная дата YYYY-MM-DD. */
export function isValidDateOnly(value: string): boolean {
  const parsed = Date.parse(`${value}T00:00:00Z`);
  if (!Number.isFinite(parsed)) return false;
  return new Date(parsed).toISOString().slice(0, 10) === value;
}

/** Остаток дней подписки (ceil), не меньше 0. */
export function daysLeftUntil(expiresAt: string, now: number = Date.now()): number | null {
  const expiresMs = Date.parse(expiresAt);
  if (!Number.isFinite(expiresMs)) return null;
  return Math.max(0, Math.ceil((expiresMs - now) / DAY_MS));
}
