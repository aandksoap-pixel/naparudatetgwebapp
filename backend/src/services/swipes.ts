/**
 * Свайпы и мэтчи. Лимиты и создание мэтча — атомарно в RPC app_process_swipe,
 * чтобы не было гонок между партнёрами.
 */
import { AppError, appErrors, mapDbError } from '../lib/errors.js';
import { callRpc, supabaseAdmin } from '../lib/supabase.js';
import type {
  Category,
  MatchRow,
  ProcessSwipeResult,
  SwipeDirection,
  SwipeRow,
} from '../types.js';
import { notifyNewMatch } from './notifications.js';
import { FREE_LIMITS, getPairParticipantIds } from './state.js';

export interface SwipeInput {
  category: Category;
  itemId: string;
  itemTitle: string;
  itemPoster: string;
  direction: SwipeDirection;
}

export interface SwipeOutcome {
  match: MatchRow | null;
  isMatch: boolean;
  newMatch: boolean;
}

export async function processSwipe(userId: number, input: SwipeInput): Promise<SwipeOutcome> {
  let result: ProcessSwipeResult;

  try {
    result = await callRpc<ProcessSwipeResult>('app_process_swipe', {
      p_user_id: userId,
      p_category: input.category,
      p_item_id: input.itemId,
      p_item_title: input.itemTitle,
      p_item_poster: input.itemPoster,
      p_direction: input.direction,
    });
  } catch (error) {
    if (error instanceof AppError && error.code === 'LIMIT_REACHED') {
      const rawLimit = error.details?.limit;
      const limit = typeof rawLimit === 'number' ? rawLimit : FREE_LIMITS[input.category];
      throw appErrors.limitReached(input.category, limit);
    }
    throw error;
  }

  if (result.new_match && result.match) {
    const participantIds = await getPairParticipantIds(result.swipe.pair_id);
    await notifyNewMatch(participantIds, result.match.item_title);
  }

  return {
    match: result.match,
    isMatch: result.is_match,
    newMatch: result.new_match,
  };
}

export async function completeMatch(
  userId: number,
  matchId: string,
  isCompleted: boolean,
): Promise<MatchRow> {
  return callRpc<MatchRow>('app_complete_match', {
    p_user_id: userId,
    p_match_id: matchId,
    p_completed: isCompleted,
  });
}

/** Набор уже свайпнутых текущим пользователем item_id — для фильтрации колоды. */
export async function getSwipedItemIds(
  userId: number,
  category: Category,
): Promise<Set<string>> {
  const { data: user, error: userError } = await supabaseAdmin
    .from('users')
    .select('pair_id')
    .eq('id', userId)
    .maybeSingle();
  if (userError) throw mapDbError(userError);
  const pairId = (user as { pair_id: string | null } | null)?.pair_id;
  if (!pairId) return new Set();

  const { data, error } = await supabaseAdmin
    .from('swipes')
    .select('item_id')
    .eq('pair_id', pairId)
    .eq('user_id', userId)
    .eq('category', category);
  if (error) throw mapDbError(error);

  const rows = (data ?? []) as Pick<SwipeRow, 'item_id'>[];
  return new Set(rows.map((row) => row.item_id));
}
