/**
 * Обработчики бота: /start (включая deep-link join_<code>), /help,
 * callback «Выполнено», pre_checkout_query и successful_payment.
 * Все пользовательские строки экранируются (parse_mode: HTML).
 */
import type { Bot, Context } from 'grammy';
import type { InlineKeyboardMarkup } from 'grammy/types';
import { config } from '../config.js';
import { AppError } from '../lib/errors.js';
import { escapeHtml } from '../lib/html.js';
import { logger } from '../lib/logger.js';
import type { TelegramUser } from '../lib/telegram-auth.js';
import { normalizeInviteCode } from '../lib/validation.js';
import { ensureUser, joinPair } from '../services/pairs.js';
import {
  handlePreCheckoutQuery,
  handleSuccessfulPayment,
} from '../services/payments/telegram-stars.js';
import { markReminderDone } from '../services/reminders.js';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const REMINDER_CALLBACK_PREFIX = 'reminder_done:';

function toTelegramUser(from: {
  id: number;
  username?: string;
  first_name: string;
  last_name?: string;
}): TelegramUser {
  return {
    id: from.id,
    username: from.username ?? null,
    firstName: from.first_name,
    lastName: from.last_name ?? null,
    avatarUrl: null,
    languageCode: null,
  };
}

function openSpaceKeyboard(): InlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [{ text: 'Открыть пространство', web_app: { url: config.miniAppUrl } }],
    ],
  };
}

async function safeReply(
  ctx: Context,
  text: string,
  keyboard?: InlineKeyboardMarkup,
): Promise<void> {
  try {
    await ctx.reply(text, {
      parse_mode: 'HTML',
      reply_markup: keyboard,
    });
  } catch (error) {
    logger.warn({ err: error }, 'Не удалось отправить сообщение пользователю');
  }
}

export function registerBotHandlers(bot: Bot): void {
  bot.command('start', async (ctx) => {
    const from = ctx.from;
    if (!from) return;

    try {
      const user = await ensureUser(toTelegramUser(from));
      const payload = typeof ctx.match === 'string' ? ctx.match.trim() : '';

      // Deep-link: https://t.me/<bot>?start=join_<code> (или startapp в Mini App).
      if (/^join_/i.test(payload) && !user.pair_id) {
        try {
          const result = await joinPair(user.id, normalizeInviteCode(payload));
          const partnerName = result.partner?.first_name ?? 'партнёр';
          await safeReply(
            ctx,
            `🎉 Готово! Теперь вы вместе с <b>${escapeHtml(partnerName)}</b>.\n\nОткрой приложение, чтобы начать.`,
            openSpaceKeyboard(),
          );
        } catch (error) {
          const message =
            error instanceof AppError
              ? error.message
              : 'Не удалось присоединиться к паре. Попробуй ещё раз.';
          await safeReply(
            ctx,
            `${escapeHtml(message)}\n\nОткрой приложение и попробуй снова.`,
            openSpaceKeyboard(),
          );
        }
        return;
      }

      const text = user.pair_id
        ? `С возвращением, <b>${escapeHtml(user.first_name)}</b>! ❤️\n\nВаше общее пространство ждёт.`
        : `Привет, <b>${escapeHtml(user.first_name)}</b>! 👋\n\n` +
          'Это «Пространство для двоих» — личное место для тебя и любимого человека.\n\n' +
          'Создай пару в приложении и отправь партнёру ссылку-приглашение.';

      await safeReply(ctx, text, openSpaceKeyboard());
    } catch (error) {
      logger.error({ err: error, userId: from.id }, 'Ошибка обработки /start');
      await safeReply(ctx, 'Что-то пошло не так. Попробуй ещё раз чуть позже.');
    }
  });

  bot.command('help', async (ctx) => {
    const text =
      '«Пространство для двоих» — мини-приложение для пар.\n\n' +
      '• Свайпайте фильмы и еду, чтобы найти общие желания\n' +
      '• Делитесь настроением друг с другом\n' +
      '• Отправляйте напоминания партнёру\n\n' +
      'Команды:\n' +
      '/start — открыть пространство\n' +
      '/help — эта справка';
    await safeReply(ctx, text, openSpaceKeyboard());
  });

  bot.callbackQuery(/^reminder_done:/, async (ctx) => {
    const data = ctx.callbackQuery.data;
    const reminderId = data.slice(REMINDER_CALLBACK_PREFIX.length);
    const from = ctx.from;

    if (!from) {
      await ctx
        .answerCallbackQuery({ text: 'Не удалось определить пользователя' })
        .catch(() => undefined);
      return;
    }
    if (!UUID_REGEX.test(reminderId)) {
      await ctx
        .answerCallbackQuery({ text: 'Некорректное напоминание', show_alert: true })
        .catch(() => undefined);
      return;
    }

    try {
      await markReminderDone(from.id, reminderId);
      await ctx
        .answerCallbackQuery({ text: 'Отлично! Напоминание выполнено ✅' })
        .catch(() => undefined);
      await ctx
        .editMessageReplyMarkup({ reply_markup: { inline_keyboard: [] } })
        .catch(() => undefined);
    } catch (error) {
      logger.warn({ err: error, reminderId, userId: from.id }, 'Не удалось отметить напоминание');
      const message =
        error instanceof AppError ? error.message : 'Не удалось отметить. Попробуйте позже.';
      await ctx
        .answerCallbackQuery({ text: message, show_alert: true })
        .catch(() => undefined);
    }
  });

  bot.on('pre_checkout_query', async (ctx) => {
    const query = ctx.update.pre_checkout_query;
    if (!query) return;
    try {
      await handlePreCheckoutQuery(query);
    } catch (error) {
      logger.error({ err: error }, 'Ошибка обработки pre_checkout_query');
    }
  });

  bot.on('message:successful_payment', async (ctx) => {
    const payment = ctx.message.successful_payment;
    if (!payment) return;
    const payerId = ctx.from?.id;
    if (!payerId) {
      logger.warn({ chatId: ctx.chat.id }, 'successful_payment без отправителя');
      return;
    }
    try {
      await handleSuccessfulPayment(payment, payerId);
    } catch (error) {
      logger.error({ err: error, payerId }, 'Ошибка обработки successful_payment');
    }
  });
}
