/** Тёплые сообщения партнёру (не напоминания). */
import { appErrors, mapDbError } from '../lib/errors.js';
import { logger } from '../lib/logger.js';
import { supabaseAdmin } from '../lib/supabase.js';
import type { LoveMessageRow } from '../types.js';
import { notifyLoveMessage } from './notifications.js';
import { getPartnerRow, getUserRow } from './state.js';

export async function sendLoveMessage(
  userId: number,
  text: string,
): Promise<LoveMessageRow> {
  const user = await getUserRow(userId);
  if (!user.pair_id) throw appErrors.noPair();
  const partner = await getPartnerRow(user.pair_id, userId);
  if (!partner) throw appErrors.noPair('Партнёр ещё не присоединился к пространству');

  const trimmed = text.trim();
  if (trimmed.length < 1 || trimmed.length > 300) {
    throw appErrors.validation('Сообщение должно быть от 1 до 300 символов');
  }

  const { data, error } = await supabaseAdmin
    .from('love_messages')
    .insert({
      pair_id: user.pair_id,
      sender_id: userId,
      receiver_id: partner.id,
      text: trimmed,
    })
    .select('*')
    .single();
  if (error) throw mapDbError(error);

  void notifyLoveMessage(partner.id, user.first_name, trimmed).catch((notifyError: unknown) => {
    logger.warn({ err: notifyError, userId, partnerId: partner.id }, 'Не удалось отправить love-пуш');
  });

  return data as LoveMessageRow;
}
