/**
 * Выпуск Supabase-совместимого JWT для Realtime.
 *
 * Frontend использует его только для Realtime: `supabase.realtime.setAuth(token)`.
 * Claims-контракт (docs/BUILD_SPEC.md, раздел 3):
 *   { role: "authenticated", aud: "authenticated", sub, telegram_id, pair_id, iat, exp }
 */
import jwt from 'jsonwebtoken';
import { config } from '../config.js';

/** Время жизни Realtime-токена — 2 часа. */
export const REALTIME_TOKEN_TTL_SECONDS = 2 * 60 * 60;

export interface RealtimeTokenInput {
  userId: number;
  pairId: string | null;
}

interface RealtimeClaims {
  role: 'authenticated';
  aud: 'authenticated';
  sub: string;
  telegram_id: string;
  pair_id: string | null;
}

export function createRealtimeToken({ userId, pairId }: RealtimeTokenInput): string {
  const claims: RealtimeClaims = {
    role: 'authenticated',
    aud: 'authenticated',
    sub: String(userId),
    telegram_id: String(userId),
    pair_id: pairId,
  };
  return jwt.sign(claims, config.supabase.jwtSecret, {
    algorithm: 'HS256',
    expiresIn: REALTIME_TOKEN_TTL_SECONDS,
    ...(config.supabase.jwtKid ? { keyid: config.supabase.jwtKid } : {}),
  });
}
