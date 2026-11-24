import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { api, getErrorMessage, isApiError } from '@/lib/api';
import { getInitData } from '@/lib/telegram';
import { useInterval } from '@/hooks/useInterval';
import {
  useRealtime,
  type RealtimeStatus,
} from '@/hooks/useRealtime';
import type {
  AppState,
  PaywallReason,
  PublicConfig,
  RealtimeCredentials,
  SessionResponse,
} from '@/types/api';

const STATE_POLL_INTERVAL_MS = 30_000;
const SESSION_REFRESH_INTERVAL_MS = 100 * 60 * 1000;

export interface AppContextValue {
  state: AppState | null;
  session: SessionResponse | null;
  realtime: RealtimeCredentials | null;
  config: PublicConfig | null;
  loading: boolean;
  error: string | null;
  authError: boolean;
  channelGateUrl: string | null;
  notice: string | null;
  realtimeStatus: RealtimeStatus;
  refresh: () => Promise<void>;
  refreshSession: () => Promise<void>;
  applyState: (state: AppState) => void;
  retry: () => void;
  dismissNotice: () => void;
  paywallReason: PaywallReason | null;
  openPaywall: (reason: PaywallReason) => void;
  closePaywall: () => void;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: ReactNode }): JSX.Element {
  const [state, setState] = useState<AppState | null>(null);
  const [session, setSession] = useState<SessionResponse | null>(null);
  const [realtime, setRealtime] = useState<RealtimeCredentials | null>(null);
  const [config, setConfig] = useState<PublicConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [authError, setAuthError] = useState(false);
  const [channelGateUrl, setChannelGateUrl] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [paywallReason, setPaywallReason] = useState<PaywallReason | null>(null);

  const mountedRef = useRef(true);
  const stateRef = useRef<AppState | null>(null);
  const lastSessionAtRef = useRef(0);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const applyState = useCallback((next: AppState): void => {
    stateRef.current = next;
    setState(next);
  }, []);

  /**
   * POST /api/session: первичная загрузка или перезапрос после смены пары.
   * showLoader=false — фоновое обновление без глобального спиннера.
   */
  const loadSession = useCallback(
    async (showLoader: boolean, forceChannelCheck = false): Promise<void> => {
      if (!getInitData()) {
        if (showLoader) {
          setLoading(false);
          setAuthError(true);
        }
        return;
      }

      if (showLoader) {
        setLoading(true);
        setError(null);
        setAuthError(false);
      }

      try {
        const response = await api.createSession(forceChannelCheck);
        if (!mountedRef.current) return;
        lastSessionAtRef.current = Date.now();
        stateRef.current = response.state;
        setState(response.state);
        setSession(response);
        setRealtime(response.realtime);
        setConfig(response.config);
        setAuthError(false);
        setChannelGateUrl(null);
        if (response.notice && response.notice.trim().length > 0) {
          setNotice(response.notice);
        }
      } catch (caught) {
        if (!mountedRef.current) return;
        if (isApiError(caught) && caught.code === 'CHANNEL_SUBSCRIPTION_REQUIRED') {
          const url = caught.details?.channelUrl;
          setChannelGateUrl(typeof url === 'string' && url.length > 0 ? url : null);
          setError(null);
          setAuthError(false);
          return;
        }
        if (isApiError(caught) && caught.isAuthError) {
          setAuthError(true);
          setError(getErrorMessage(caught));
          return;
        }
        if (!stateRef.current) {
          setError(getErrorMessage(caught));
        }
      } finally {
        if (mountedRef.current && showLoader) setLoading(false);
      }
    },
    [],
  );

  /** GET /api/state — без глобального лоадера, безопасен для polling. */
  const refresh = useCallback(async (): Promise<void> => {
    if (!getInitData()) return;
    try {
      const next = await api.getState();
      if (!mountedRef.current) return;
      applyState(next);
      setAuthError(false);
    } catch (caught) {
      if (!mountedRef.current) return;
      if (isApiError(caught) && caught.isAuthError) {
        setAuthError(true);
        setError(getErrorMessage(caught));
      }
      /* Сетевые ошибки фонового обновления не показываем — данные остаются. */
    }
  }, [applyState]);

  const refreshSession = useCallback(async (): Promise<void> => {
    await loadSession(false);
  }, [loadSession]);

  const retry = useCallback((): void => {
    // Повторная проверка канала должна обходить 15-секундный кэш.
    void loadSession(true, true);
  }, [loadSession]);

  const dismissNotice = useCallback((): void => {
    setNotice(null);
  }, []);

  const openPaywall = useCallback((reason: PaywallReason): void => {
    setPaywallReason(reason);
  }, []);

  const closePaywall = useCallback((): void => {
    setPaywallReason(null);
  }, []);

  /* Первичный bootstrap сессии. */
  useEffect(() => {
    void loadSession(true);
  }, [loadSession]);

  const realtimeStatus = useRealtime({
    credentials: realtime,
    enabled: Boolean(realtime?.token && state?.pair),
    onChange: () => {
      void refresh();
    },
  });

  /* Fallback: polling состояния раз в 30 секунд, только когда вкладка видна. */
  useInterval(() => {
    if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
      void refresh();
    }
  }, STATE_POLL_INTERVAL_MS);

  /* Realtime-токен живёт 2 часа: заранее обновляем сессию. */
  useInterval(() => {
    if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
      void refreshSession();
    }
  }, SESSION_REFRESH_INTERVAL_MS);

  /* Мгновенное обновление при возврате в приложение. Если Realtime-токен
     мог истечь (2 часа), сначала перезапрашиваем сессию. */
  useEffect(() => {
    const refreshOnResume = (): void => {
      const age = Date.now() - lastSessionAtRef.current;
      if (lastSessionAtRef.current > 0 && age > 90 * 60 * 1000) {
        void refreshSession();
      } else {
        void refresh();
      }
    };
    const handleVisible = (): void => {
      if (document.visibilityState === 'visible') refreshOnResume();
    };
    const handleFocus = (): void => {
      refreshOnResume();
    };
    document.addEventListener('visibilitychange', handleVisible);
    window.addEventListener('focus', handleFocus);
    return () => {
      document.removeEventListener('visibilitychange', handleVisible);
      window.removeEventListener('focus', handleFocus);
    };
  }, [refresh, refreshSession]);

  const value = useMemo<AppContextValue>(
    () => ({
      state,
      session,
      realtime,
      config,
      loading,
      error,
      authError,
      channelGateUrl,
      notice,
      realtimeStatus,
      refresh,
      refreshSession,
      applyState,
      retry,
      dismissNotice,
      paywallReason,
      openPaywall,
      closePaywall,
    }),
    [
      state,
      session,
      realtime,
      config,
      loading,
      error,
      authError,
      channelGateUrl,
      notice,
      realtimeStatus,
      refresh,
      refreshSession,
      applyState,
      retry,
      dismissNotice,
      paywallReason,
      openPaywall,
      closePaywall,
    ],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppContextValue {
  const value = useContext(AppContext);
  if (!value) {
    throw new Error('useApp must be used within AppProvider');
  }
  return value;
}
