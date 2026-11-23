/**
 * Пользователи и пары: ensureUser, создание/вступление/выход из пары,
 * профиль и дата начала отношений. Все мутации — через RPC из schema.sql.
 */
import { mapDbError } from '../lib/errors.js';
import { callRpc, supabaseAdmin } from '../lib/supabase.js';
import { normalizeInviteCode } from '../lib/validation.js';
import type {
  CreatePairResult,
  JoinPairResult,
  LeavePairResult,
  PairRow,
  UserRow,
} from '../types.js';
import { notifyPartnerJoined } from './notifications.js';
import { getUserRow } from './state.js';

const MAX_NAME_LENGTH = 64;

export interface EnsureUserInput {
  id: number;
  username: string | null;
  firstName: string;
  lastName: string | null;
  avatarUrl: string | null;
}

function normalizeDisplayName(value: string): string {
  const name = value.trim().slice(0, MAX_NAME_LENGTH);
  return name.length > 0 ? name : 'Пользователь';
}

/**
 * Создаёт пользователя при первом входе и обновляет только те поля,
 * которые Telegram подтверждает: username, avatar_url.
 * Отредактированное пользователем first_name не перезаписывается.
 */
export async function ensureUser(input: EnsureUserInput): Promise<UserRow> {
  const { data: existingData, error: selectError } = await supabaseAdmin
    .from('users')
    .select('*')
    .eq('id', input.id)
    .maybeSingle();
  if (selectError) throw mapDbError(selectError);

  const existing = (existingData as UserRow | null) ?? null;
  if (!existing) {
    const { data: insertedData, error: insertError } = await supabaseAdmin
      .from('users')
      .insert({
        id: input.id,
        username: input.username,
        first_name: normalizeDisplayName(input.firstName),
        avatar_url: input.avatarUrl,
      })
      .select('*')
      .single();

    if (insertError) {
      // Параллельный первый вход (session + любой запрос): читаем созданную запись.
      if (insertError.code === '23505') {
        const { data: racedData, error: racedError } = await supabaseAdmin
          .from('users')
          .select('*')
          .eq('id', input.id)
          .single();
        if (racedError) throw mapDbError(racedError);
        return racedData as UserRow;
      }
      throw mapDbError(insertError);
    }
    return insertedData as UserRow;
  }

  const nextUsername = input.username;
  // Если Telegram скрыл фото (null), не стираем ранее сохранённый аватар.
  const nextAvatarUrl = input.avatarUrl ?? existing.avatar_url;

  if (existing.username === nextUsername && existing.avatar_url === nextAvatarUrl) {
    return existing;
  }

  const { data: updatedData, error: updateError } = await supabaseAdmin
    .from('users')
    .update({ username: nextUsername, avatar_url: nextAvatarUrl })
    .eq('id', input.id)
    .select('*')
    .single();
  if (updateError) throw mapDbError(updateError);
  return updatedData as UserRow;
}

export async function createPair(userId: number): Promise<CreatePairResult> {
  return callRpc<CreatePairResult>('app_create_pair', { p_user_id: userId });
}

export async function joinPair(
  userId: number,
  inviteCode: string,
): Promise<JoinPairResult> {
  const code = normalizeInviteCode(inviteCode);
  const result = await callRpc<JoinPairResult>('app_join_pair', {
    p_user_id: userId,
    p_invite_code: code,
  });

  if (result.joined && result.partner) {
    const joiner = await getUserRow(userId);
    await notifyPartnerJoined(result.partner.id, joiner.first_name);
  }

  return result;
}

export async function leavePair(userId: number): Promise<LeavePairResult> {
  return callRpc<LeavePairResult>('app_leave_pair', { p_user_id: userId });
}

export async function setDisplayName(userId: number, displayName: string): Promise<UserRow> {
  return callRpc<UserRow>('app_set_display_name', {
    p_user_id: userId,
    p_name: displayName,
  });
}

export async function setRelationshipStart(
  userId: number,
  relationshipStartDate: string | null,
): Promise<PairRow> {
  return callRpc<PairRow>('app_set_relationship_start', {
    p_user_id: userId,
    p_date: relationshipStartDate,
  });
}
