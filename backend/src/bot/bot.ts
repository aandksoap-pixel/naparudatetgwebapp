/**
 * Инициализация grammY-бота: webhook и polling режимы, команды, menu button,
 * глобальный обработчик ошибок.
 */
import { Bot } from 'grammy';
import { config } from '../config.js';
import { logger } from '../lib/logger.js';
import { registerBotHandlers } from './handlers.js';

export const bot = new Bot(config.telegram.botToken);

registerBotHandlers(bot);

bot.catch((error) => {
  logger.error(
    {
      err: error.error,
      updateId: error.ctx.update.update_id,
    },
    'Ошибка обработки апдейта Telegram',
  );
});

async function configureBotProfile(): Promise<void> {
  try {
    await bot.api.setMyCommands([
      { command: 'start', description: 'Открыть пространство' },
      { command: 'help', description: 'Помощь' },
    ]);
    await bot.api.setChatMenuButton({
      menu_button: {
        type: 'web_app',
        text: 'Открыть пространство',
        web_app: { url: config.miniAppUrl },
      },
    });
  } catch (error) {
    logger.warn({ err: error }, 'Не удалось настроить команды и menu button бота');
  }
}

/**
 * Запускает бота. Не падает, если Telegram недоступен — только логирует,
 * чтобы сервер всё равно мог обслуживать API.
 */
export async function setupBot(): Promise<void> {
  try {
    await bot.init();
  } catch (error) {
    logger.error({ err: error }, 'Не удалось получить информацию о боте (bot.init)');
  }

  await configureBotProfile();

  if (config.telegram.mode === 'webhook') {
    const baseUrl = config.telegram.publicBaseUrl;
    const secretToken = config.telegram.webhookSecret;
    if (!baseUrl || !secretToken) {
      logger.error(
        'BOT_MODE=webhook требует PUBLIC_BASE_URL и TELEGRAM_WEBHOOK_SECRET — webhook не установлен',
      );
      return;
    }
    try {
      await bot.api.setWebhook(`${baseUrl}/webhook/telegram`, {
        secret_token: secretToken,
        drop_pending_updates: false,
        allowed_updates: ['message', 'callback_query', 'pre_checkout_query'],
      });
      logger.info({ webhookUrl: `${baseUrl}/webhook/telegram` }, 'Webhook установлен');
    } catch (error) {
      logger.error({ err: error }, 'Не удалось установить webhook Telegram');
    }
    return;
  }

  // Polling: удаляем webhook, чтобы Telegram не отправлял апдейты дважды.
  try {
    await bot.api.deleteWebhook({ drop_pending_updates: false });
  } catch (error) {
    logger.warn({ err: error }, 'Не удалось удалить webhook перед polling');
  }

  void bot
    .start({
      onStart: (botInfo) => {
        logger.info({ username: botInfo.username }, 'Бот запущен в режиме polling');
      },
    })
    .catch((error: unknown) => {
      logger.error({ err: error }, 'Polling бота остановился из-за ошибки');
    });
}

/** Аккуратная остановка polling-бота при graceful shutdown. */
export async function stopBot(): Promise<void> {
  if (config.telegram.mode !== 'polling') return;
  try {
    await bot.stop();
    logger.info('Polling бота остановлен');
  } catch (error) {
    logger.warn({ err: error }, 'Не удалось остановить бота');
  }
}
