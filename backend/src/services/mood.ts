/**
 * Настроение: сохранение через RPC app_set_mood (антиспам-пуш реализован в SQL)
 * и уведомление партнёра с учётом should_notify.
 */
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
    const user = await getUserRow(userId);
    if (user.pair_id) {
      const partner = await getPartnerRow(user.pair_id, userId);
      if (partner) {
        const preset = findMoodPreset(result.user.mood_status);
        notifiedPartner = await notifyMoodChanged(
          partner.id,
          user.first_name,
          result.user.mood_text,
          preset ? { emoji: preset.emoji, label: preset.label } : null,
        );
      }
    }
  }

  return { user: result.user, notifiedPartner };
}
