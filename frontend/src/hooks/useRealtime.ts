import { useEffect, useRef, useState } from 'react';
import {
  createClient,
  type RealtimeChannel,
  type SupabaseClient,
} from '@supabase/supabase-js';
import type { RealtimeCredentials } from '@/types/api';

const REALTIME_TABLES = [
  'users',
  'pairs',
  'matches',
  'reminders',
  'daily_usage',
  'love_messages',
] as const;

const REFRESH_DEBOUNCE_MS = 400;

export type RealtimeStatus =
  | 'disabled'
  | 'connecting'
  | 'connected'
  | 'error';

interface UseRealtimeOptions {
  credentials: RealtimeCredentials | null;
  enabled: boolean;
  onChange: () => void;
}

/**
 * Подписка на изменения пары через Supabase Realtime.
 *
 * Клиент создаётся заново при смене токена: после create/join/leave пары
 * backend выдаёт новый JWT, и старый больше не подходит для RLS.
 */
export function useRealtime({
  credentials,
  enabled,
  onChange,
}: UseRealtimeOptions): RealtimeStatus {
  const [status, setStatus] = useState<RealtimeStatus>('disabled');
  const onChangeRef = useRef(onChange);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  const url = credentials?.url ?? null;
  const anonKey = credentials?.anonKey ?? null;
  const token = credentials?.token ?? null;

  useEffect(() => {
    if (!enabled || !url || !anonKey || !token) {
      setStatus('disabled');
      return;
    }

    let cancelled = false;
    let debounceId: number | undefined;
    let channel: RealtimeChannel | null = null;
    let client: SupabaseClient | null = null;

    const scheduleRefresh = (): void => {
      if (cancelled) return;
      if (debounceId !== undefined) window.clearTimeout(debounceId);
      debounceId = window.setTimeout(() => {
        if (!cancelled) onChangeRef.current();
      }, REFRESH_DEBOUNCE_MS);
    };

    const setup = async (): Promise<void> => {
      let createdClient: SupabaseClient;
      try {
        createdClient = createClient(url, anonKey, {
          auth: {
            persistSession: false,
            autoRefreshToken: false,
            detectSessionInUrl: false,
          },
          realtime: {
            params: { eventsPerSecond: 5 },
          },
        });
      } catch {
        if (!cancelled) setStatus('error');
        return;
      }

      client = createdClient;
      setStatus('connecting');

      try {
        await createdClient.realtime.setAuth(token);
      } catch {
        /* даже если setAuth не удался, попробуем подписаться */
      }

      if (cancelled) return;

      const nextChannel = createdClient.channel('pair-sync');

      for (const table of REALTIME_TABLES) {
        nextChannel.on(
          'postgres_changes',
          { event: '*', schema: 'public', table },
          () => scheduleRefresh(),
        );
      }

      nextChannel.subscribe((subscribeStatus) => {
        if (cancelled) return;
        if (subscribeStatus === 'SUBSCRIBED') setStatus('connected');
        else if (
          subscribeStatus === 'CHANNEL_ERROR' ||
          subscribeStatus === 'TIMED_OUT'
        ) {
          setStatus('error');
        } else if (subscribeStatus === 'CLOSED') {
          setStatus('disabled');
        } else {
          setStatus('connecting');
        }
      });

      channel = nextChannel;
    };

    void setup();

    return () => {
      cancelled = true;
      if (debounceId !== undefined) window.clearTimeout(debounceId);
      if (client) {
        if (channel) void client.removeChannel(channel);
        void client.realtime.disconnect();
      }
    };
  }, [url, anonKey, token, enabled]);

  return status;
}
