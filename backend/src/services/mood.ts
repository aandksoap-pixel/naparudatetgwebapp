/**
 * Настроение: сохранение через RPC app_set_mood (антиспам-пуш реализован в SQL)
 * и уведомление партнёра с учётом should_notify.
 */
import { logger } from '../lib/logger.js';
import { callRpc } from '../lib/supabase.js';
import { findMoodPreset, type MoodStatus, type SetMoodResult, type UserRow } from '../types.js';
import { notifyMoodChanged } from './notifications.js';
import { getPartnerRow, getUserRow } from './state.js';

export interface MoodUpdateOutcome {
  user: UserRow;
  notifiedPartner: boolean;
}

export async function setMood(
  userId: number,
  moodStatus: MoodStatus,
  moodText: string | null,
): Promise<MoodUpdateOutcome> {
  const result = await callRpc<SetMoodResult>('app_set_mood', {
    p_user_id: userId,
    p_status: moodStatus,
    p_text: moodText,
  });

  let notifiedPartner = false;

  if (result.should_notify) {
    notifiedPartner = true;
    // Пуш не должен задерживать сохранение настроения в приложении.
    void (async () => {
      const user = await getUserRow(userId);
      if (!user.pair_id) return;
      const partner = await getPartnerRow(user.pair_id, userId);
      if (!partner) return;
      const preset = findMoodPreset(result.user.mood_status);
      const sent = await notifyMoodChanged(
        partner.id,
        user.first_name,
        result.user.mood_text,
        preset ? { emoji: preset.emoji, label: preset.label } : null,
      );
      if (!sent) {
        logger.warn({ userId, partnerId: partner.id }, 'Пуш о настроении не доставлен');
      }
    })().catch((error: unknown) => {
      logger.warn({ err: error, userId }, 'Ошибка фонового пуша о настроении');
    });
  }

  return { user: result.user, notifiedPartner };
}
