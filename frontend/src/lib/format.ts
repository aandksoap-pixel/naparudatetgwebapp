import type {
  Category,
  MoodStatus,
  PlanType,
  ReminderInfo,
  SwipeItem,
} from '@/types/api';

/* ------------------------------------------------------------------ */
/* Числа и склонения                                                   */
/* ------------------------------------------------------------------ */

export function plural(
  count: number,
  one: string,
  few: string,
  many: string,
): string {
  const abs = Math.abs(Math.trunc(count)) % 100;
  const last = abs % 10;
  if (abs > 10 && abs < 20) return many;
  if (last > 1 && last < 5) return few;
  if (last === 1) return one;
  return many;
}

export function formatDays(count: number): string {
  return `${count} ${plural(count, 'день', 'дня', 'дней')}`;
}

export function formatMinutes(count: number): string {
  return `${count} ${plural(count, 'минуту', 'минуты', 'минут')}`;
}

export function formatHours(count: number): string {
  return `${count} ${plural(count, 'час', 'часа', 'часов')}`;
}

export function formatNumber(value: number): string {
  return new Intl.NumberFormat('ru-RU').format(value);
}

export function formatPriceRub(value: number): string {
  return `${formatNumber(value)}\u00A0₽`;
}

export function formatStars(value: number): string {
  return `${formatNumber(value)}\u00A0⭐`;
}

/* ------------------------------------------------------------------ */
/* Даты                                                                */
/* ------------------------------------------------------------------ */

const dateFormatter = new Intl.DateTimeFormat('ru-RU', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

const shortDateFormatter = new Intl.DateTimeFormat('ru-RU', {
  day: 'numeric',
  month: 'short',
});

const timeFormatter = new Intl.DateTimeFormat('ru-RU', {
  hour: '2-digit',
  minute: '2-digit',
});

export function parseDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Дата без времени (YYYY-MM-DD) должна читаться как локальная. */
export function parseDateOnly(value: string | null | undefined): Date | null {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (match) {
    const date = new Date(
      Number(match[1]),
      Number(match[2]) - 1,
      Number(match[3]),
    );
    return Number.isNaN(date.getTime()) ? null : date;
  }
  return parseDate(value);
}

export function formatDate(value: string | null | undefined): string {
  const date = parseDateOnly(value);
  return date ? dateFormatter.format(date) : '';
}

export function formatShortDate(value: string | null | undefined): string {
  const date = parseDateOnly(value);
  return date ? shortDateFormatter.format(date) : '';
}

export function formatTime(value: string | null | undefined): string {
  const date = parseDate(value);
  return date ? timeFormatter.format(date) : '';
}

export function formatDateTime(value: string | null | undefined): string {
  const date = parseDate(value);
  if (!date) return '';
  return `${shortDateFormatter.format(date)}, ${timeFormatter.format(date)}`;
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function isTomorrow(date: Date, now: Date): boolean {
  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);
  return isSameDay(date, tomorrow);
}

function isYesterday(date: Date, now: Date): boolean {
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  return isSameDay(date, yesterday);
}

/** «через 30 минут», «5 минут назад», «вчера в 18:30». */
export function formatRelative(
  value: string | null | undefined,
  nowInput: Date = new Date(),
): string {
  const date = parseDate(value);
  if (!date) return '';
  const now = nowInput;
  const diff = date.getTime() - now.getTime();
  const abs = Math.abs(diff);

  if (abs < 60_000) {
    return diff >= 0 ? 'совсем скоро' : 'только что';
  }
  if (abs < 60 * 60_000) {
    const minutes = Math.max(1, Math.round(abs / 60_000));
    const amount = formatMinutes(minutes);
    return diff > 0 ? `через ${amount}` : `${amount} назад`;
  }
  if (abs < 24 * 60 * 60_000 && isSameDay(date, now)) {
    return diff > 0
      ? `сегодня в ${timeFormatter.format(date)}`
      : `${formatHours(Math.max(1, Math.round(abs / (60 * 60_000))))} назад`;
  }
  if (isTomorrow(date, now)) {
    return `завтра в ${timeFormatter.format(date)}`;
  }
  if (isYesterday(date, now)) {
    return `вчера в ${timeFormatter.format(date)}`;
  }
  if (date.getFullYear() === now.getFullYear()) {
    return `${shortDateFormatter.format(date)} в ${timeFormatter.format(date)}`;
  }
  return formatDate(date.toISOString());
}

/** Значение для <input type="date"> (локальная дата). */
export function toDateInputValue(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function todayDateInput(): string {
  return toDateInputValue(new Date());
}

/** Значение для <input type="datetime-local">. */
export function toDateTimeInputValue(date: Date): string {
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${toDateInputValue(date)}T${hours}:${minutes}`;
}

export function fromDateTimeInputValue(value: string): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Дата в формате YYYY-MM-DD, пригодная для API. */
export function toApiDate(value: Date): string {
  return toDateInputValue(value);
}

/* ------------------------------------------------------------------ */
/* Настроение                                                          */
/* ------------------------------------------------------------------ */

export interface MoodPreset {
  key: MoodStatus;
  emoji: string;
  label: string;
  short: string;
}

export const MOOD_PRESETS: readonly MoodPreset[] = [
  { key: 'hugs', emoji: '🥰', label: 'Хочу обнимашек', short: 'обнимашки' },
  { key: 'tired', emoji: '🔋', label: 'На нуле, нужен отдых', short: 'отдых' },
  { key: 'snack', emoji: '🍕', label: 'Хочу вкусняшку', short: 'вкусняшка' },
  { key: 'playful', emoji: '🔥', label: 'Игривое настроение', short: 'игривое' },
  { key: 'stressed', emoji: '😤', label: 'Стресс / не трогать', short: 'стресс' },
  { key: 'chill', emoji: '🎬', label: 'Хочу чиллить', short: 'чиллить' },
  { key: 'adventure', emoji: '🚀', label: 'Готов(а) к движу', short: 'движ' },
  { key: 'miss', emoji: '🥺', label: 'Скучаю', short: 'скучаю' },
];

export function getMoodPreset(status: MoodStatus): MoodPreset {
  return MOOD_PRESETS.find((preset) => preset.key === status) ?? MOOD_PRESETS[5];
}

export function getMoodDisplay(
  status: MoodStatus,
  text: string | null,
): { emoji: string; label: string } {
  const preset = getMoodPreset(status);
  const custom = text?.trim();
  return {
    emoji: preset.emoji,
    label: custom && custom.length > 0 ? custom : preset.short,
  };
}

/* ------------------------------------------------------------------ */
/* План и прочее                                                       */
/* ------------------------------------------------------------------ */

export function planLabel(plan: PlanType): 'FREE' | 'TRIAL' | 'PRO' {
  if (plan === 'trial') return 'TRIAL';
  if (plan === 'pro_monthly' || plan === 'pro_yearly') return 'PRO';
  return 'FREE';
}

export function planTitle(plan: PlanType): string {
  if (plan === 'trial') return 'Пробный период';
  if (plan === 'pro_monthly') return 'PRO · месяц';
  if (plan === 'pro_yearly') return 'PRO · год';
  return 'Бесплатный план';
}

export function categoryLabel(category: Category): string {
  return category === 'movie' ? 'Фильмы' : 'Еда';
}

export function itemPoster(item: SwipeItem): string {
  return item.category === 'movie' ? item.poster : item.photo;
}

export function initials(name: string): string {
  const cleaned = name.trim();
  if (!cleaned) return '?';
  const parts = cleaned.split(/\s+/).filter((part) => part.length > 0);
  if (parts.length === 0) return '?';
  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }
  return `${parts[0][0] ?? ''}${parts[1][0] ?? ''}`.toUpperCase();
}

export function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return `${text.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

export function reminderStatus(reminder: ReminderInfo): {
  label: string;
  tone: 'pending' | 'sent' | 'done';
} {
  if (reminder.isDone) return { label: 'Выполнено', tone: 'done' };
  if (reminder.isSent) return { label: 'Отправлено', tone: 'sent' };
  return { label: 'Запланировано', tone: 'pending' };
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/**
 * Invite deep-link. Используем ?start= (бот обрабатывает join), а не
 * ?startapp=, который требует зарегистрированного Main Mini App.
 */
export function buildPairInviteLink(
  botUsername: string | null | undefined,
  inviteCode: string,
): string {
  const bot = (botUsername ?? 'naparulove_bot').replace(/^@/, '');
  return `https://t.me/${bot}?start=join_${inviteCode}`;
}
