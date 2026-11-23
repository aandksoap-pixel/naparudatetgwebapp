/**
 * Напоминания: создание (с немедленной отправкой, если время пришло),
 * доставка через бота с inline-кнопкой «Выполнено», отметка о выполнении,
 * обработка ошибок отправки с возвратом в очередь (не более 3 попыток).
 */
import { mapDbError } from '../lib/errors.js';
import { logger } from '../lib/logger.js';
import { callRpc, supabaseAdmin } from '../lib/supabase.js';
import type {
  CreateReminderResult,
  MarkReminderDoneResult,
  ReminderRow,
} from '../types.js';
import { notifyReminder, notifyReminderDone } from './notifications.js';
import { getUserRow } from './state.js';

const MAX_SEND_ATTEMPTS = 3;

export interface CreateReminderOutcome {
  reminder: ReminderRow;
  sentImmediately: boolean;
}

async function getReminderRow(reminderId: string): Promise<ReminderRow | null> {
  const { data, error } = await supabaseAdmin
    .from('reminders')
    .select('*')
    .eq('id', reminderId)
    .maybeSingle();
  if (error) throw mapDbError(error);
  return (data as ReminderRow | null) ?? null;
}

/**
 * Возвращает напоминание в очередь после неудачной отправки:
 * is_sent=false, sent_at=null, send_attempts++, last_error.
 */
async function resetReminderForRetry(reminderId: string, reason: string): Promise<void> {
  try {
    const current = await getReminderRow(reminderId);
    if (!current || current.send_attempts >= MAX_SEND_ATTEMPTS) return;

    const { error } = await supabaseAdmin
      .from('reminders')
      .update({
        is_sent: false,
        sent_at: null,
        send_attempts: current.send_attempts + 1,
        last_error: reason.slice(0, 500),
      })
      .eq('id', reminderId);

    if (error) {
      logger.error({ err: error, reminderId }, 'Не удалось вернуть напоминание в очередь');
    }
  } catch (error) {
    logger.error({ err: error, reminderId }, 'Ошибка resetReminderForRetry');
  }
}

/** Отправляет напоминание получателю. При ошибке возвращает запись в очередь. */
async function deliverReminder(reminder: ReminderRow): Promise<boolean> {
  const [sender, receiver] = await Promise.all([
    getUserRow(reminder.sender_id).catch(() => null),
    getUserRow(reminder.receiver_id).catch(() => null),
  ]);

  if (!receiver) {
    await resetReminderForRetry(reminder.id, 'receiver_not_found');
    return false;
  }

  const sent = await notifyReminder(
    receiver.id,
    sender?.first_name ?? 'Партнёр',
    reminder.text,
    reminder.id,
  );
  if (!sent) {
    await resetReminderForRetry(reminder.id, 'telegram_send_failed');
    return false;
  }
  return true;
}

export async function createReminder(
  userId: number,
  text: string,
  remindAt: string | null,
): Promise<CreateReminderOutcome> {
  const result = await callRpc<CreateReminderResult>('app_create_reminder', {
    p_user_id: userId,
    p_text: text,
    p_remind_at: remindAt,
  });

  let reminder = result.reminder;
  let sentImmediately = false;

  const remindAtMs = Date.parse(reminder.remind_at);
  const dueNow = Number.isFinite(remindAtMs) ? remindAtMs <= Date.now() + 5_000 : true;

  if (dueNow) {
    const claimed = await callRpc<ReminderRow | null>('app_claim_reminder', {
      p_reminder_id: reminder.id,
    });
    if (claimed) {
      sentImmediately = await deliverReminder(claimed);
      reminder = (await getReminderRow(reminder.id)) ?? claimed;
    }
  }

  return { reminder, sentImmediately };
}

export async function markReminderDone(
  userId: number,
  reminderId: string,
): Promise<ReminderRow> {
  const result = await callRpc<MarkReminderDoneResult>('app_mark_reminder_done', {
    p_user_id: userId,
    p_reminder_id: reminderId,
  });

  if (!result.already_done) {
    const receiver = await getUserRow(userId).catch(() => null);
    await notifyReminderDone(
      result.sender_id,
      receiver?.first_name ?? 'Партнёр',
      result.reminder.text,
    );
  }

  return result.reminder;
}

/**
 * Крон: атомарно забирает пачку созревших напоминаний (app_claim_reminders)
 * и отправляет их. Возвращает количество обработанных записей.
 */
export async function processDueReminders(limit = 50): Promise<number> {
  const claimed = await callRpc<ReminderRow[] | null>('app_claim_reminders', {
    p_limit: limit,
  });
  const reminders = Array.isArray(claimed) ? claimed : [];

  for (const reminder of reminders) {
    try {
      await deliverReminder(reminder);
    } catch (error) {
      logger.error(
        { err: error, reminderId: reminder.id },
        'Не удалось доставить напоминание из очереди',
      );
      await resetReminderForRetry(reminder.id, 'delivery_error');
    }
  }

  return reminders.length;
}

export { getReminderRow };
