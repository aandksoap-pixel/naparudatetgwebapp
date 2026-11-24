import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { AppProvider, useApp } from './context/AppContext';
import { ToastProvider, useToast } from './context/ToastContext';
import { ErrorBoundary } from './components/ErrorBoundary';
import { LoadingScreen, Spinner } from './components/LoadingScreen';
import { OnboardingPair } from './components/OnboardingPair';
import { HeaderPair } from './components/HeaderPair';
import { BottomNav, type TabKey } from './components/BottomNav';
import { PaywallModal } from './components/PaywallModal';
import { SwipesTab } from './components/tabs/SwipesTab';
import { MoodTab } from './components/tabs/MoodTab';
import { RemindersTab } from './components/tabs/RemindersTab';
import { ProfileTab } from './components/tabs/ProfileTab';
import { getInitData, closeTelegramApp, openTelegramLink } from './lib/telegram';
import { hapticError, hapticSelection } from './lib/haptics';

/* ------------------------------------------------------------------ */
/* Экраны-заглушки вместо белого экрана                                */
/* ------------------------------------------------------------------ */

function ScreenShell({ children }: { children: ReactNode }): JSX.Element {
  return (
    <div className="flex min-h-[var(--app-height)] w-full items-center justify-center px-5 py-10">
      <div className="w-full max-w-sm rounded-4xl border border-slate-300/20 bg-tg-bg/85 p-6 text-center shadow-card backdrop-blur-xl">
        {children}
      </div>
    </div>
  );
}

function OpenInTelegramScreen(): JSX.Element {
  const handleReload = (): void => {
    hapticError();
    window.location.reload();
  };

  return (
    <ScreenShell>
      <div className="brand-gradient mx-auto flex h-16 w-16 items-center justify-center rounded-3xl text-3xl shadow-glow">
        🫶
      </div>
      <h1 className="mt-5 text-xl font-bold leading-7 text-tg-text">
        Откройте приложение через Telegram
      </h1>
      <p className="mt-2 text-sm leading-6 text-tg-hint">
        «Пространство для двоих» работает внутри Telegram. Зайдите в бота,
        нажмите «Открыть пространство» — и всё появится.
      </p>
      <p className="mt-3 rounded-xl bg-tg-secondary-bg/60 px-3 py-2 text-[11px] leading-5 text-tg-hint">
        Если вы уже в Telegram, попробуйте перезагрузить мини-приложение.
      </p>
      <button
        type="button"
        onClick={handleReload}
        className="btn btn-primary mt-5 w-full"
      >
        Перезагрузить
      </button>
    </ScreenShell>
  );
}

function SessionRecoveryScreen({
  loading,
  onRetry,
}: {
  loading: boolean;
  onRetry: () => void;
}): JSX.Element {
  return (
    <ScreenShell>
      <div className="brand-gradient mx-auto flex h-16 w-16 items-center justify-center rounded-3xl text-3xl shadow-glow">
        🔐
      </div>
      <h1 className="mt-5 text-xl font-bold leading-7 text-tg-text">
        Переоткройте приложение
      </h1>
      <p className="mt-2 text-sm leading-6 text-tg-hint">
        Срок действия сессии Telegram истёк. Закройте мини-приложение и откройте
        его снова — мы сразу подхватим вашу пару.
      </p>
      <button
        type="button"
        onClick={() => {
          hapticSelection();
          onRetry();
        }}
        disabled={loading}
        className="btn btn-primary mt-5 w-full"
      >
        {loading ? <Spinner size={16} /> : null}
        Попробовать снова
      </button>
      <button
        type="button"
        onClick={closeTelegramApp}
        className="btn btn-ghost mt-2 w-full"
      >
        Закрыть приложение
      </button>
    </ScreenShell>
  );
}

function ChannelGateScreen({
  channelUrl,
  loading,
  onRetry,
}: {
  channelUrl: string | null;
  loading: boolean;
  onRetry: () => void;
}): JSX.Element {
  return (
    <ScreenShell>
      <div className="brand-gradient mx-auto flex h-16 w-16 items-center justify-center rounded-3xl text-3xl shadow-glow">
        📣
      </div>
      <h1 className="mt-5 text-xl font-bold leading-7 text-tg-text">
        Подпишитесь на канал
      </h1>
      <p className="mt-2 text-sm leading-6 text-tg-hint">
        Чтобы открыть «Пространство для двоих», подпишитесь на наш Telegram-канал.
        После подписки нажмите «Проверить подписку».
      </p>
      <button
        type="button"
        onClick={() => {
          if (channelUrl) {
            hapticSelection();
            openTelegramLink(channelUrl);
          }
        }}
        disabled={!channelUrl}
        className="btn btn-brand mt-5 w-full"
      >
        <span aria-hidden="true">📣</span>
        Подписаться на канал
      </button>
      <button
        type="button"
        onClick={() => {
          hapticSelection();
          onRetry();
        }}
        disabled={loading}
        className="btn btn-primary mt-2 w-full"
      >
        {loading ? <Spinner size={16} /> : <span aria-hidden="true">✅</span>}
        Проверить подписку
      </button>
      <p className="mt-3 text-[10px] leading-4 text-tg-hint">
        Доступ откроется автоматически после проверки.
      </p>
    </ScreenShell>
  );
}

function FatalErrorScreen({
  message,
  loading,
  onRetry,
}: {
  message: string;
  loading: boolean;
  onRetry: () => void;
}): JSX.Element {
  return (
    <ScreenShell>
      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-3xl bg-rose-500/10 text-3xl">
        📡
      </div>
      <h1 className="mt-5 text-xl font-bold leading-7 text-tg-text">
        Не удалось загрузить пространство
      </h1>
      <p className="mt-2 text-sm leading-6 text-tg-hint">{message}</p>
      <button
        type="button"
        onClick={() => {
          hapticSelection();
          onRetry();
        }}
        disabled={loading}
        className="btn btn-primary mt-5 w-full"
      >
        {loading ? <Spinner size={16} /> : null}
        Попробовать ещё раз
      </button>
      <p className="mt-3 text-[10px] leading-4 text-tg-hint">
        Проверьте интернет. Если не помогает — закройте и откройте приложение.
      </p>
    </ScreenShell>
  );
}

/* ------------------------------------------------------------------ */
/* Дашборд с четырьмя вкладками                                        */
/* ------------------------------------------------------------------ */

function Dashboard(): JSX.Element {
  const { state } = useApp();
  const [activeTab, setActiveTab] = useState<TabKey>('swipes');
  const reduceMotion = useReducedMotion();

  if (!state) return <LoadingScreen message="Загружаем пространство…" />;

  const handleTabChange = (next: TabKey): void => {
    if (next === activeTab) return;
    hapticSelection();
    setActiveTab(next);
    window.scrollTo({
      top: 0,
      behavior: reduceMotion ? 'auto' : 'smooth',
    });
  };

  return (
    <div className="relative mx-auto flex min-h-[var(--app-height)] w-full max-w-[520px] flex-col">
      <HeaderPair
        state={state}
        onOpenMood={() => handleTabChange('mood')}
      />

      <main className="page-bottom min-w-0 flex-1">
        <div className={activeTab === 'swipes' ? 'block' : 'hidden'}>
          <SwipesTab />
        </div>
        <div className={activeTab === 'mood' ? 'block' : 'hidden'}>
          <MoodTab />
        </div>
        <div className={activeTab === 'reminders' ? 'block' : 'hidden'}>
          <RemindersTab />
        </div>
        <div className={activeTab === 'profile' ? 'block' : 'hidden'}>
          <ProfileTab />
        </div>
      </main>

      <BottomNav activeTab={activeTab} onChange={handleTabChange} />
      <PaywallModal />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Корневой контент                                                    */
/* ------------------------------------------------------------------ */

function AppContent(): JSX.Element {
  const {
    state,
    loading,
    error,
    authError,
    channelGateUrl,
    notice,
    dismissNotice,
    retry,
  } = useApp();
  const toast = useToast();
  const shownNoticesRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!notice) return;
    if (!shownNoticesRef.current.has(notice)) {
      shownNoticesRef.current.add(notice);
      toast.info(notice);
    }
    dismissNotice();
  }, [notice, dismissNotice, toast]);

  if (channelGateUrl !== null) {
    return <ChannelGateScreen channelUrl={channelGateUrl} loading={loading} onRetry={retry} />;
  }

  if (authError) {
    return <SessionRecoveryScreen loading={loading} onRetry={retry} />;
  }

  if (loading && !state) {
    return <LoadingScreen />;
  }

  if (error && !state) {
    return (
      <FatalErrorScreen
        message={error}
        loading={loading}
        onRetry={retry}
      />
    );
  }

  if (!state) {
    return <LoadingScreen message="Подключаемся к пространству…" />;
  }

  if (!state.pair || !state.partner) {
    return <OnboardingPair />;
  }

  return <Dashboard />;
}

function AppRoot(): JSX.Element {
  const [initData, setInitData] = useState(() => getInitData());

  /* В редких случаях Telegram отдаёт initData чуть позже — дочитываем. */
  useEffect(() => {
    if (initData) return;
    let attempts = 0;
    const timer = window.setInterval(() => {
      attempts += 1;
      const next = getInitData();
      if (next) {
        setInitData(next);
        window.clearInterval(timer);
      } else if (attempts >= 24) {
        window.clearInterval(timer);
      }
    }, 500);
    return () => window.clearInterval(timer);
  }, [initData]);

  if (!initData) {
    return <OpenInTelegramScreen />;
  }

  return (
    <AppProvider>
      <AppContent />
    </AppProvider>
  );
}

export default function App(): JSX.Element {
  return (
    <ErrorBoundary>
      <ToastProvider>
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.2 }}
          className="w-full"
        >
          <AppRoot />
        </motion.div>
      </ToastProvider>
    </ErrorBoundary>
  );
}
