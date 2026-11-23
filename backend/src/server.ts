/**
 * Точка входа backend: сборка приложения, запуск бота и планировщика,
 * graceful shutdown по SIGINT/SIGTERM.
 */
import { buildApp } from './app.js';
import { setupBot, stopBot } from './bot/bot.js';
import { config } from './config.js';
import { startJobs, stopJobs } from './jobs.js';
import { logger } from './lib/logger.js';

async function main(): Promise<void> {
  const app = await buildApp();

  // Бот не должен мешать поднятию API: setupBot сам логирует ошибки Telegram.
  await setupBot();
  startJobs();

  await app.listen({ port: config.port, host: config.host });
  logger.info(
    {
      port: config.port,
      host: config.host,
      env: config.nodeEnv,
      botMode: config.telegram.mode,
      internalCron: config.internalCronEnabled,
    },
    'Backend запущен',
  );

  let shuttingDown = false;

  const shutdown = async (signal: string): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ signal }, 'Получен сигнал завершения — останавливаем сервер');

    stopJobs();
    await stopBot();

    try {
      await app.close();
      logger.info('Сервер остановлен');
      process.exit(0);
    } catch (error) {
      logger.error({ err: error }, 'Ошибка при остановке сервера');
      process.exit(1);
    }
  };

  process.once('SIGINT', () => {
    void shutdown('SIGINT');
  });
  process.once('SIGTERM', () => {
    void shutdown('SIGTERM');
  });

  process.on('unhandledRejection', (reason) => {
    logger.error({ err: reason }, 'Необработанный rejection');
  });
  process.on('uncaughtException', (error) => {
    logger.fatal({ err: error }, 'Необработанное исключение — завершаем процесс');
    process.exit(1);
  });
}

main().catch((error: unknown) => {
  logger.fatal({ err: error }, 'Не удалось запустить backend');
  process.exit(1);
});
