/**
 * Планировщик: раз в минуту отправляет созревшие напоминания, раз в час
 * истекает подписки. Защищён от наложения запусков. Ручной тик доступен
 * через POST /api/cron/tick.
 */
import { config } from './config.js';
import { logger } from './lib/logger.js';
import { processDueReminders } from './services/reminders.js';
import { expireSubscriptions } from './services/subscription.js';

const REMINDERS_BATCH_LIMIT = 50;
const JOBS_INTERVAL_MS = 60_000;
const SUBSCRIPTIONS_INTERVAL_MS = 60 * 60 * 1000;

export interface JobsResult {
  skipped: boolean;
  remindersClaimed: number;
  subscriptionsExpired: number;
}

let running = false;
let lastSubscriptionsRunAt = 0;
let intervalHandle: NodeJS.Timeout | null = null;

export async function runJobs(
  options: { forceSubscriptions?: boolean } = {},
): Promise<JobsResult> {
  if (running) {
    logger.warn('Предыдущий запуск планировщика ещё выполняется — пропускаем');
    return { skipped: true, remindersClaimed: 0, subscriptionsExpired: 0 };
  }

  running = true;
  const result: JobsResult = {
    skipped: false,
    remindersClaimed: 0,
    subscriptionsExpired: 0,
  };

  try {
    try {
      result.remindersClaimed = await processDueReminders(REMINDERS_BATCH_LIMIT);
    } catch (error) {
      logger.error({ err: error }, 'Ошибка обработки очереди напоминаний');
    }

    const shouldExpireSubscriptions =
      options.forceSubscriptions === true ||
      Date.now() - lastSubscriptionsRunAt >= SUBSCRIPTIONS_INTERVAL_MS;

    if (shouldExpireSubscriptions) {
      try {
        result.subscriptionsExpired = await expireSubscriptions();
        lastSubscriptionsRunAt = Date.now();
      } catch (error) {
        logger.error({ err: error }, 'Ошибка обработки истёкших подписок');
      }
    }

    return result;
  } finally {
    running = false;
  }
}

export function startJobs(): void {
  if (!config.internalCronEnabled) {
    logger.info('Внутренний планировщик отключён (ENABLE_INTERNAL_CRON=false)');
    return;
  }
  if (intervalHandle) return;

  intervalHandle = setInterval(() => {
    void runJobs().catch((error: unknown) => {
      logger.error({ err: error }, 'Неожиданная ошибка планировщика');
    });
  }, JOBS_INTERVAL_MS);

  logger.info({ intervalMs: JOBS_INTERVAL_MS }, 'Внутренний планировщик запущен');
}

export function stopJobs(): void {
  if (!intervalHandle) return;
  clearInterval(intervalHandle);
  intervalHandle = null;
  logger.info('Внутренний планировщик остановлен');
}
