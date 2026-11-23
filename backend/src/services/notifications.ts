/**
 * Уведомления в Telegram от имени бота.
 *
 * Все функции «мягкие»: ошибки Telegram API логируются и не ломают основной
 * запрос пользователя. Пользовательские строки обязательно экранируются.
 */
import { Api } from 'grammy';
import type { InlineKeyboardMarkup } from 'grammy/types';
import { config } from '../config.js';
import { escapeHtml } from '../lib/html.js';
import { logger } from '../lib/logger.js';
import type { PaymentPlan } from '../types.js';

const api = new Api(config.telegram.botToken);

async function sendMessage(
  chatId: number,
  text: string,
  keyboard?: InlineKeyboardMarkup,
): Promise<boolean> {
  try {
    await api.sendMessage(chatId, text, {
      parse_mode: 'HTML',
      reply_markup: keyboard,
    });
    return true;
  } catch (error) {
    logger.warn({ err: error, chatId }, 'Не удалось отправить уведомление в Telegram');
    return false;
  }
}

/** Партнёр присоединился по приглашению. */
export async function notifyPartnerJoined(
  partnerTelegramId: number,
  joinerName: string,
): Promise<boolean> {
  return sendMessage(
    partnerTelegramId,
    `🎉 <b>${escapeHtml(joinerName)}</b> присоединился(ась) к твоему пространству!\n\nТеперь вы вместе в «Пространстве для двоих» ❤️`,
  );
}

/** Мэтч — уведомляем обоих участников пары. */
export async function notifyNewMatch(
  participantIds: readonly number[],
  itemTitle: string,
): Promise<void> {
  const text = `🔥 У вас мэтч! Вы оба хотите: «${escapeHtml(itemTitle)}»`;
  await Promise.all(participantIds.map((chatId) => sendMessage(chatId, text)));
}

/** Партнёр обновил настроение. */
export async function notifyMoodChanged(
  partnerTelegramId: number,
  userName: string,
  moodText: string | null,
  preset: { emoji: string; label: string } | null,
): Promise<boolean> {
  const moodHtml = moodText
    ? `«${escapeHtml(moodText)}»`
    : preset
      ? `${preset.emoji} ${escapeHtml(preset.label)}`
      : '—';
  return sendMessage(
    partnerTelegramId,
    `💭 <b>${escapeHtml(userName)}</b> обновил(а) настроение: ${moodHtml}`,
  );
}

/** Напоминание получателю с inline-кнопкой «Выполнено». */
export async function notifyReminder(
  receiverTelegramId: number,
  senderName: string,
  text: string,
  reminderId: string,
): Promise<boolean> {
  const keyboard: InlineKeyboardMarkup = {
    inline_keyboard: [
      [{ text: '✅ Выполнено', callback_data: `reminder_done:${reminderId}` }],
    ],
  };
  return sendMessage(
    receiverTelegramId,
    `🔔 <b>${escapeHtml(senderName)}</b> передаёт напоминание:\n\n${escapeHtml(text)}`,
    keyboard,
  );
}

/** Отправителю — уведомление, что напоминание выполнено. */
export async function notifyReminderDone(
  senderTelegramId: number,
  receiverName: string,
  text: string,
): Promise<boolean> {
  return sendMessage(
    senderTelegramId,
    `✅ <b>${escapeHtml(receiverName)}</b> выполнил(а) твоё напоминание: «${escapeHtml(text)}»`,
  );
}

/** Партнёру — активация триала. */
export async function notifyTrialActivated(
  partnerTelegramId: number,
  userName: string,
  trialDays: number,
): Promise<boolean> {
  return sendMessage(
    partnerTelegramId,
    `🎁 <b>${escapeHtml(userName)}</b> активировал(а) PRO на ${trialDays} дня для вас двоих`,
  );
}

/** Оплата подписки — уведомляем обоих участников пары. */
export async function notifyPaymentSuccess(
  participantIds: readonly number[],
  plan: PaymentPlan,
): Promise<void> {
  const period = plan === 'monthly' ? 'на месяц' : 'на год';
  const text =
    `✨ PRO ${period} активирован для вас двоих!\n\n` +
    'Безлимитные свайпы и напоминания уже доступны. Спасибо за поддержку ❤️';
  await Promise.all(participantIds.map((chatId) => sendMessage(chatId, text)));
}

/** Подписка истекла — уведомляем обоих. */
export async function notifySubscriptionExpired(
  participantIds: readonly number[],
): Promise<void> {
  const text =
    '⏳ Ваш PRO-доступ завершился. Продлите подписку всего за 149 ₽/мес на двоих, ' +
    'чтобы свайпать без ограничений';
  await Promise.all(participantIds.map((chatId) => sendMessage(chatId, text)));
}
