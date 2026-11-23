/**
 * Хелперы для экранирования пользовательских строк в HTML-сообщениях бота
 * (parse_mode: 'HTML') и для безопасного сравнения секретов.
 */
import { timingSafeEqual } from 'node:crypto';

const HTML_ENTITIES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

/** Экранирует HTML-спецсимволы. Telegram HTML допускает ограниченный набор тегов. */
export function escapeHtml(value: unknown): string {
  return String(value ?? '').replace(/[&<>"']/g, (char) => HTML_ENTITIES[char] ?? char);
}

/** Обрезает текст до maxLength символов (для безопасной длины сообщений). */
export function truncateText(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, Math.max(0, maxLength - 1))}…`;
}

/** Сравнение строк за константное время (секреты, HMAC-подписи). */
export function safeCompare(a: string, b: string): boolean {
  const bufferA = Buffer.from(a, 'utf8');
  const bufferB = Buffer.from(b, 'utf8');
  if (bufferA.length !== bufferB.length) return false;
  return timingSafeEqual(bufferA, bufferB);
}
