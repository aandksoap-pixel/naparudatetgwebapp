/**
 * Zod-схемы тел запросов, query и параметров маршрутов.
 * Все входящие данные валидируются до вызова сервисов.
 */
import { z } from 'zod';
import { appErrors } from './errors.js';
import { isValidDateOnly } from './moscow.js';

/** Парсинг любого входа (body/query/params) с единым форматом ошибки 400. */
export function parseInput<TSchema extends z.ZodTypeAny>(
  schema: TSchema,
  value: unknown,
  message = 'Проверьте правильность введённых данных',
): z.output<TSchema> {
  const result = schema.safeParse(value ?? {});
  if (!result.success) {
    const issues = result.error.issues.map((issue) => ({
      path: issue.path.join('.'),
      message: issue.message,
    }));
    throw appErrors.validation(message, { issues });
  }
  return result.data;
}

/** Строка-дата YYYY-MM-DD, существующая в календаре. */
const dateOnlySchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Ожидается дата в формате YYYY-MM-DD')
  .refine((value) => isValidDateOnly(value), 'Такой даты не существует');

export const moodStatusSchema = z.enum([
  'hugs',
  'tired',
  'snack',
  'playful',
  'stressed',
  'chill',
  'adventure',
  'miss',
]);

export const categorySchema = z.enum(['movie', 'food']);

export const swipeDirectionSchema = z.enum(['left', 'right']);

export const paymentPlanSchema = z.enum(['monthly', 'yearly']);

export const pairJoinSchema = z.object({
  inviteCode: z
    .string()
    .trim()
    .min(1, 'Введите код приглашения')
    .max(64, 'Слишком длинный код приглашения'),
});

export const profileUpdateSchema = z.object({
  displayName: z
    .string()
    .trim()
    .min(1, 'Введите имя')
    .max(40, 'Имя не длиннее 40 символов'),
});

export const pairDateSchema = z.object({
  relationshipStartDate: dateOnlySchema.nullable(),
});

export const moodSchema = z.object({
  moodStatus: moodStatusSchema,
  moodText: z
    .string()
    .trim()
    .max(40, 'Статус не длиннее 40 символов')
    .nullable()
    .optional()
    .default(null),
});

export const swipeSchema = z.object({
  category: categorySchema,
  itemId: z.string().trim().min(1, 'Некорректный itemId').max(128, 'Слишком длинный itemId'),
  itemTitle: z.string().trim().min(1, 'Некорректное название').max(200, 'Слишком длинное название'),
  itemPoster: z.string().max(2048, 'Слишком длинная ссылка на постер').optional().default(''),
  direction: swipeDirectionSchema,
});

export const matchUpdateSchema = z.object({
  isCompleted: z.boolean(),
});

export const reminderCreateSchema = z.object({
  text: z
    .string()
    .trim()
    .min(1, 'Введите текст напоминания')
    .max(200, 'Напоминание не длиннее 200 символов'),
  remindAt: z
    .string()
    .trim()
    .min(1)
    .refine((value) => Number.isFinite(Date.parse(value)), 'Некорректное время напоминания')
    .nullable()
    .optional()
    .default(null),
});

export const subscriptionPlanSchema = z.object({
  plan: paymentPlanSchema,
});

export const idParamSchema = z.object({
  id: z.string().uuid('Некорректный идентификатор'),
});

export const contentQuerySchema = z.object({
  limit: z.coerce
    .number()
    .int('Лимит должен быть целым числом')
    .min(1, 'Лимит не меньше 1')
    .max(30, 'Лимит не больше 30')
    .default(30),
});

/**
 * Приводит код приглашения к виду, который понимает app_join_pair:
 * убирает префикс join_, ссылку ?startapp=... и приводит к верхнему регистру.
 */
export function normalizeInviteCode(input: string): string {
  let code = input.trim();

  const startappMatch = /startapp=([A-Za-z0-9_]+)/i.exec(code);
  const startMatch = /[?&]start=([A-Za-z0-9_]+)/i.exec(code);
  const fromUrl = startappMatch?.[1] ?? startMatch?.[1];
  if (fromUrl) code = fromUrl;

  code = code.replace(/^join_/i, '').trim().toUpperCase();
  return code;
}
