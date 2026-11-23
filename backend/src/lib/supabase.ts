/**
 * Supabase-клиент backend.
 *
 * Backend работает только через service role: RPC-функции и таблицы закрыты
 * от anon/authenticated. Клиент не хранит сессию — авторизация приходит из
 * Telegram initData.
 */
import { createClient } from '@supabase/supabase-js';
import { config } from '../config.js';
import { mapDbError } from './errors.js';

export const supabaseAdmin = createClient(
  config.supabase.url,
  config.supabase.serviceRoleKey,
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: {
      headers: { 'X-Client-Info': 'space-for-two-backend' },
    },
  },
);

/**
 * Вызов RPC-функции с автоматическим маппингом ошибок PostgreSQL
 * в AppError (клиент не увидит SQL-текст).
 */
export async function callRpc<T>(
  functionName: string,
  args: Record<string, unknown>,
): Promise<T> {
  const { data, error } = await supabaseAdmin.rpc(functionName, args);
  if (error) {
    throw mapDbError(error);
  }
  return data as T;
}
