/**
 * Конфигурация backend.
 *
 * Все переменные окружения валидируются Zod на старте. Если критичная
 * переменная отсутствует или имеет неверный формат — процесс завершается
 * с понятным сообщением, при этом значения секретов никогда не логируются.
 */
import 'dotenv/config';
import { z } from 'zod';

const booleanFromEnv = (defaultValue: boolean) =>
  z
    .enum(['true', 'false', '1', '0'])
    .optional()
    .transform((value) => {
      if (value === undefined) return defaultValue;
      return value === 'true' || value === '1';
    });

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
    PORT: z.coerce.number().int().min(1).max(65535).default(3000),
    HOST: z.string().min(1).default('0.0.0.0'),
    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
      .default('info'),
    CORS_ORIGINS: z.string().min(1, 'Укажите хотя бы один разрешённый origin'),

    TELEGRAM_BOT_TOKEN: z.string().min(10, 'Похоже, это не токен бота'),
    TELEGRAM_BOT_USERNAME: z
      .string()
      .min(1, 'Укажите username бота (без @)')
      .transform((value) => value.replace(/^@/, '').trim()),
    TELEGRAM_WEBHOOK_SECRET: z.string().min(8).optional(),
    TELEGRAM_REQUIRED_CHANNEL: z.string().min(1).optional(),
    TELEGRAM_CHANNEL_URL: z.string().url().optional(),
    PUBLIC_BASE_URL: z.string().url().optional(),
    BOT_MODE: z.enum(['polling', 'webhook']).default('polling'),
    INIT_DATA_MAX_AGE_SECONDS: z.coerce.number().int().min(60).max(604800).default(86400),
    MINI_APP_URL: z.string().url(),

    SUPABASE_URL: z.string().url(),
    SUPABASE_ANON_KEY: z.string().min(10),
    SUPABASE_SERVICE_ROLE_KEY: z.string().min(10),
    SUPABASE_JWT_SECRET: z.string().min(8),
    SUPABASE_JWT_KID: z.string().min(1).optional(),

    TMDB_API_KEY: z.string().min(1).optional(),
    TMDB_ACCESS_TOKEN: z.string().min(1).optional(),

    PAYMENT_SIGNING_SECRET: z
      .string()
      .min(16, 'Секрет подписи платежей должен быть не короче 16 символов'),
    STARS_MONTHLY: z.coerce.number().int().min(1, 'Цена в звёздах должна быть больше 0'),
    STARS_YEARLY: z.coerce.number().int().min(1, 'Цена в звёздах должна быть больше 0'),
    PRICE_MONTHLY_RUB: z.coerce.number().positive('Цена должна быть больше 0'),
    PRICE_YEARLY_RUB: z.coerce.number().positive('Цена должна быть больше 0'),

    CRON_SECRET: z.string().min(8).optional(),
    ENABLE_INTERNAL_CRON: booleanFromEnv(true),
  })
  .superRefine((value, ctx) => {
    if (value.BOT_MODE === 'webhook') {
      if (!value.TELEGRAM_WEBHOOK_SECRET) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['TELEGRAM_WEBHOOK_SECRET'],
          message: 'обязателен при BOT_MODE=webhook',
        });
      }
      if (!value.PUBLIC_BASE_URL) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['PUBLIC_BASE_URL'],
          message: 'обязателен при BOT_MODE=webhook (нужен публичный HTTPS-адрес backend)',
        });
      }
    }
  });

export type Env = z.infer<typeof envSchema>;

/**
 * Пустые строки в .env (например `TMDB_API_KEY=`) трактуем как «переменная
 * не задана», иначе необязательные URL/секреты падали бы на валидации.
 */
const rawEnv: Record<string, string> = {};
for (const [key, value] of Object.entries(process.env)) {
  if (typeof value === 'string' && value.trim().length > 0) {
    rawEnv[key] = value;
  }
}

const parsedEnv = envSchema.safeParse(rawEnv);

if (!parsedEnv.success) {
  const problems = parsedEnv.error.issues
    .map((issue) => {
      const path = issue.path.length > 0 ? issue.path.join('.') : 'env';
      return `  • ${path}: ${issue.message}`;
    })
    .join('\n');
  // Секреты не печатаем — только имена переменных и причины.
  console.error(
    [
      '',
      '[config] Не удалось запустить backend: некорректные переменные окружения.',
      problems,
      '',
      'Сверьтесь с backend/.env.example и заполните обязательные значения.',
      '',
    ].join('\n'),
  );
  process.exit(1);
}

const env: Env = parsedEnv.data;

function parseCorsOrigins(raw: string): string[] {
  const origins = raw
    .split(',')
    .map((origin) => origin.trim().replace(/\/+$/, ''))
    .filter((origin) => origin.length > 0);
  // Telegram Web всегда разрешён: Mini App открывается в web-клиенте.
  if (!origins.includes('https://web.telegram.org') && !origins.includes('*')) {
    origins.push('https://web.telegram.org');
  }
  return origins;
}

function trimTrailingSlashes(url: string): string {
  return url.replace(/\/+$/, '');
}

export interface AppConfig {
  nodeEnv: 'development' | 'production' | 'test';
  isProduction: boolean;
  port: number;
  host: string;
  logLevel: string;
  corsOrigins: string[];
  miniAppUrl: string;
  trialDays: number;
  telegram: {
    botToken: string;
    botUsername: string;
    mode: 'polling' | 'webhook';
    webhookSecret: string | null;
    publicBaseUrl: string | null;
    initDataMaxAgeSeconds: number;
    requiredChannel: string | null;
    channelUrl: string | null;
  };
  supabase: {
    url: string;
    anonKey: string;
    serviceRoleKey: string;
    jwtSecret: string;
    jwtKid: string | null;
  };
  tmdb: {
    apiKey: string | null;
    accessToken: string | null;
  };
  payment: {
    signingSecret: string;
    starsMonthly: number;
    starsYearly: number;
    priceMonthlyRub: number;
    priceYearlyRub: number;
  };
  cronSecret: string | null;
  internalCronEnabled: boolean;
}

/** Триал фиксирован продуктовой спекой: 2 дня, один раз на пару. */
const TRIAL_DAYS = 2;

export const config: AppConfig = {
  nodeEnv: env.NODE_ENV,
  isProduction: env.NODE_ENV === 'production',
  port: env.PORT,
  host: env.HOST,
  logLevel: env.LOG_LEVEL,
  corsOrigins: parseCorsOrigins(env.CORS_ORIGINS),
  miniAppUrl: trimTrailingSlashes(env.MINI_APP_URL),
  trialDays: TRIAL_DAYS,
  telegram: {
    botToken: env.TELEGRAM_BOT_TOKEN,
    botUsername: env.TELEGRAM_BOT_USERNAME,
    mode: env.BOT_MODE,
    webhookSecret: env.TELEGRAM_WEBHOOK_SECRET ?? null,
    publicBaseUrl: env.PUBLIC_BASE_URL ? trimTrailingSlashes(env.PUBLIC_BASE_URL) : null,
    initDataMaxAgeSeconds: env.INIT_DATA_MAX_AGE_SECONDS,
    requiredChannel: env.TELEGRAM_REQUIRED_CHANNEL?.trim() || null,
    channelUrl:
      env.TELEGRAM_CHANNEL_URL ??
      (env.TELEGRAM_REQUIRED_CHANNEL
        ? `https://t.me/${env.TELEGRAM_REQUIRED_CHANNEL.replace(/^@/, '')}`
        : null),
  },
  supabase: {
    url: trimTrailingSlashes(env.SUPABASE_URL),
    anonKey: env.SUPABASE_ANON_KEY,
    serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY,
    jwtSecret: env.SUPABASE_JWT_SECRET,
    jwtKid: env.SUPABASE_JWT_KID ?? null,
  },
  tmdb: {
    apiKey: env.TMDB_API_KEY ?? null,
    accessToken: env.TMDB_ACCESS_TOKEN ?? null,
  },
  payment: {
    signingSecret: env.PAYMENT_SIGNING_SECRET,
    starsMonthly: env.STARS_MONTHLY,
    starsYearly: env.STARS_YEARLY,
    priceMonthlyRub: env.PRICE_MONTHLY_RUB,
    priceYearlyRub: env.PRICE_YEARLY_RUB,
  },
  cronSecret: env.CRON_SECRET ?? null,
  internalCronEnabled: env.ENABLE_INTERNAL_CRON,
};
