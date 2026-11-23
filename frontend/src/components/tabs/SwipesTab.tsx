import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import type {
  Category,
  MatchInfo,
  SwipeDirection,
  SwipeItem,
} from '@/types/api';
import { api, getErrorMessage, isApiError } from '@/lib/api';
import {
  hapticError,
  hapticImpact,
  hapticSelection,
  hapticWarning,
} from '@/lib/haptics';
import { useApp } from '@/context/AppContext';
import { useToast } from '@/context/ToastContext';
import { SwipeDeck } from '@/components/SwipeDeck';
import { LimitMeter } from '@/components/LimitMeter';
import { MatchModal } from '@/components/MatchModal';
import { MatchesSheet } from '@/components/MatchesSheet';
import { Spinner } from '@/components/LoadingScreen';

const CONTENT_LIMIT = 30;
const MIN_DECK_SIZE = 4;

type Decks = Record<Category, SwipeItem[]>;
type LoadedMap = Record<Category, boolean>;
type ErrorMap = Record<Category, string | null>;
type BooleanMap = Record<Category, boolean>;

function createDecks(): Decks {
  return { movie: [], food: [] };
}

const CATEGORY_TABS: ReadonlyArray<{
  key: Category;
  label: string;
  icon: string;
}> = [
  { key: 'movie', label: 'Фильмы', icon: '🎬' },
  { key: 'food', label: 'Еда', icon: '🍕' },
];

/** Вкладка свайпов: колода, лимиты, мэтчи и paywall при исчерпании. */
export function SwipesTab(): JSX.Element {
  const {
    state,
    applyState,
    refresh,
    refreshSession,
    openPaywall,
  } = useApp();
  const toast = useToast();
  const reduceMotion = useReducedMotion();

  const [category, setCategory] = useState<Category>('movie');
  const [decks, setDecks] = useState<Decks>(createDecks);
  const [loaded, setLoaded] = useState<LoadedMap>({ movie: false, food: false });
  const [loadingCategory, setLoadingCategory] = useState<Category | null>(null);
  const [errors, setErrors] = useState<ErrorMap>({ movie: null, food: null });
  const [exhausted, setExhausted] = useState<BooleanMap>({
    movie: false,
    food: false,
  });
  const [busy, setBusy] = useState(false);
  const [exitDirection, setExitDirection] = useState<SwipeDirection | null>(null);
  const [matchOpen, setMatchOpen] = useState(false);
  const [activeMatch, setActiveMatch] = useState<MatchInfo | null>(null);
  const [matchesOpen, setMatchesOpen] = useState(false);

  const loadingRef = useRef(false);
  const busyRef = useRef(false);
  const decksRef = useRef<Decks>(createDecks());
  const stateRef = useRef(state);
  const swipedRef = useRef<Record<Category, Set<string>>>({
    movie: new Set<string>(),
    food: new Set<string>(),
  });

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    decksRef.current = decks;
  }, [decks]);

  const loadDeck = useCallback(
    async (target: Category, append: boolean): Promise<number> => {
      if (loadingRef.current) return 0;
      loadingRef.current = true;
      setLoadingCategory(target);
      setErrors((previous) => ({ ...previous, [target]: null }));

      try {
        const response =
          target === 'movie'
            ? await api.getMovies(CONTENT_LIMIT)
            : await api.getFood(CONTENT_LIMIT);

        const knownIds = new Set<string>([
          ...(stateRef.current?.mySwipes[target] ?? []),
          ...swipedRef.current[target],
          ...decksRef.current[target].map((item) => item.id),
        ]);

        const fresh = response.items.filter((item) => !knownIds.has(item.id));
        const current = decksRef.current[target];
        const base = append ? current : current;
        const nextDeck = [...base, ...fresh];

        if (fresh.length > 0) {
          const nextDecks: Decks = {
            ...decksRef.current,
            [target]: nextDeck,
          };
          decksRef.current = nextDecks;
          setDecks(nextDecks);
        }

        setLoaded((previous) => ({ ...previous, [target]: true }));
        setExhausted((previous) => ({
          ...previous,
          [target]:
            response.items.length < CONTENT_LIMIT || fresh.length === 0,
        }));
        return fresh.length;
      } catch (caught) {
        const message = getErrorMessage(caught);
        setErrors((previous) => ({ ...previous, [target]: message }));
        setLoaded((previous) => ({ ...previous, [target]: true }));
        return 0;
      } finally {
        loadingRef.current = false;
        setLoadingCategory(null);
      }
    },
    [],
  );

  /* Первичная загрузка колоды выбранной категории. */
  useEffect(() => {
    if (loaded[category] || loadingCategory === category) return;
    void loadDeck(category, false);
  }, [category, loadDeck, loaded, loadingCategory]);

  /* Догрузка, когда в колоде осталось меньше 4 карточек. */
  useEffect(() => {
    if (!loaded[category]) return;
    if (loadingCategory === category) return;
    if (exhausted[category] || errors[category]) return;
    if (decks[category].length >= MIN_DECK_SIZE) return;
    void loadDeck(category, true);
  }, [
    category,
    decks,
    errors,
    exhausted,
    loadDeck,
    loaded,
    loadingCategory,
  ]);

  const handleSwipe = useCallback(
    async (direction: SwipeDirection): Promise<void> => {
      if (busyRef.current) return;
      const currentState = stateRef.current;
      const item = decksRef.current[category][0];
      if (!item || !currentState) return;

      const limitInfo =
        category === 'movie'
          ? currentState.limits.movie
          : currentState.limits.food;

      if (
        !currentState.limits.isUnlimited &&
        limitInfo.limit !== null &&
        limitInfo.used >= limitInfo.limit
      ) {
        hapticWarning();
        openPaywall(category);
        toast.info('Дневной лимит исчерпан. PRO открывает безлимит для пары.');
        void refresh();
        return;
      }

      busyRef.current = true;
      setBusy(true);
      setExitDirection(direction);
      hapticImpact('medium');

      try {
        const response = await api.sendSwipe({
          category,
          itemId: item.id,
          itemTitle: item.title,
          itemPoster:
            item.category === 'movie' ? item.poster : item.photo,
          direction,
        });

        swipedRef.current[category].add(item.id);
        const nextDecks: Decks = {
          ...decksRef.current,
          [category]: decksRef.current[category].filter(
            (deckItem) => deckItem.id !== item.id,
          ),
        };
        decksRef.current = nextDecks;
        setDecks(nextDecks);
        setExitDirection(null);
        applyState(response.state);

        if (response.newMatch && response.match) {
          setActiveMatch(response.match);
          setMatchOpen(true);
        }
      } catch (caught) {
        setExitDirection(null);
        if (isApiError(caught) && caught.code === 'LIMIT_REACHED') {
          hapticWarning();
          openPaywall(category);
          toast.error('Дневной лимит исчерпан. Откройте PRO, чтобы продолжить.');
          void refresh();
        } else if (isApiError(caught) && caught.code === 'NO_PAIR') {
          hapticError();
          toast.error('Пара больше не активна');
          void refreshSession();
        } else {
          hapticError();
          toast.error(getErrorMessage(caught));
        }
      } finally {
        busyRef.current = false;
        setBusy(false);
      }
    },
    [
      applyState,
      category,
      openPaywall,
      refresh,
      refreshSession,
      toast,
    ],
  );

  const handleCategoryChange = (next: Category): void => {
    if (next === category || busyRef.current) return;
    hapticSelection();
    setExitDirection(null);
    setCategory(next);
  };

  const handleRefreshDeck = async (): Promise<void> => {
    hapticSelection();
    const added = await loadDeck(category, true);
    if (added > 0) {
      toast.success(added === 1 ? 'Добавили ещё одну карточку' : 'Подборка обновлена');
    } else {
      toast.info('Новых карточек пока нет — заходите чуть позже');
    }
  };

  const matchesCount = state?.matches.length ?? 0;
  const deck = decks[category];
  const topItem = deck[0] ?? null;
  const isLoading = loadingCategory === category;
  const error = errors[category];
  const isExhausted = exhausted[category];
  const limits = state?.limits;
  const limitInfo = limits
    ? category === 'movie'
      ? limits.movie
      : limits.food
    : null;

  const emptyTitle = useMemo(() => {
    if (!state?.partner) return 'Зовите партнёра в пространство';
    if (isExhausted) return 'Вы посмотрели всё';
    return 'Подборка закончилась';
  }, [isExhausted, state?.partner]);

  const canShowDeck = deck.length > 0;

  return (
    <div className="mx-auto w-full max-w-[520px] px-4 pt-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex rounded-2xl bg-tg-secondary-bg/60 p-1">
          {CATEGORY_TABS.map((tab) => {
            const isActive = tab.key === category;
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => handleCategoryChange(tab.key)}
                disabled={busy}
                aria-pressed={isActive}
                className={`relative isolate flex min-h-[44px] items-center gap-1 rounded-xl px-3 text-xs font-semibold transition-colors ${
                  isActive ? 'text-tg-text' : 'text-tg-hint'
                }`}
              >
                {isActive ? (
                  <motion.span
                    aria-hidden="true"
                    layoutId="swipes-category-active"
                    className="absolute inset-0 -z-10 rounded-xl bg-tg-bg shadow-soft"
                    transition={
                      reduceMotion
                        ? { duration: 0 }
                        : { type: 'spring', stiffness: 420, damping: 34 }
                    }
                  />
                ) : null}
                <span aria-hidden="true" className="text-sm">
                  {tab.icon}
                </span>
                {tab.label}
              </button>
            );
          })}
        </div>

        <button
          type="button"
          onClick={() => {
            hapticSelection();
            setMatchesOpen(true);
          }}
          className="tap-scale relative flex min-h-[44px] items-center gap-1.5 rounded-2xl border border-slate-300/20 bg-tg-secondary-bg/50 px-3 text-xs font-semibold text-tg-text"
        >
          <span aria-hidden="true">💞</span>
          <span>Мэтчи</span>
          {matchesCount > 0 ? (
            <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-rose-500 px-1.5 text-[10px] font-bold text-white">
              {matchesCount}
            </span>
          ) : null}
        </button>
      </div>

      {limitInfo ? (
        <LimitMeter
          used={limitInfo.used}
          limit={limitInfo.limit}
          isUnlimited={limits?.isUnlimited ?? false}
          onUpgrade={() => {
            hapticWarning();
            openPaywall(category);
          }}
          className="mt-2.5"
        />
      ) : null}

      <div className="mt-3">
        {canShowDeck ? (
          <SwipeDeck
            items={deck}
            busy={busy}
            exitDirection={exitDirection}
            onSwipe={(direction) => {
              void handleSwipe(direction);
            }}
          />
        ) : isLoading ? (
          <div className="shimmer h-[clamp(330px,56vh,540px)] w-full rounded-[28px] border border-slate-300/10 bg-tg-secondary-bg/40" />
        ) : error ? (
          <div className="flex h-[clamp(330px,56vh,540px)] w-full flex-col items-center justify-center rounded-[28px] border border-dashed border-rose-300/30 bg-rose-500/5 px-6 text-center">
            <span aria-hidden="true" className="text-4xl">
              📡
            </span>
            <p className="mt-3 text-sm font-semibold text-tg-text">
              Не удалось загрузить подборку
            </p>
            <p className="mt-1.5 max-w-[280px] text-xs leading-5 text-tg-hint">
              {error}
            </p>
            <button
              type="button"
              onClick={() => {
                void loadDeck(category, false);
              }}
              className="btn btn-primary mt-4"
            >
              Повторить
            </button>
          </div>
        ) : (
          <motion.div
            initial={reduceMotion ? undefined : { opacity: 0, y: 8 }}
            animate={reduceMotion ? undefined : { opacity: 1, y: 0 }}
            className="flex h-[clamp(330px,56vh,540px)] w-full flex-col items-center justify-center rounded-[28px] border border-dashed border-slate-300/30 bg-tg-secondary-bg/30 px-6 text-center"
          >
            <span aria-hidden="true" className="text-5xl">
              {category === 'movie' ? '🎬' : '🍕'}
            </span>
            <p className="mt-3 text-lg font-bold text-tg-text">{emptyTitle}</p>
            <p className="mt-1.5 max-w-[290px] text-xs leading-5 text-tg-hint">
              {state?.partner
                ? 'Обновите подборку — возможно, там появятся новые идеи для вас двоих.'
                : 'Партнёр ещё не присоединился. Отправьте ему приглашение из профиля.'}
            </p>
            <button
              type="button"
              onClick={() => {
                void handleRefreshDeck();
              }}
              disabled={isLoading}
              className="btn btn-secondary mt-4 min-w-[200px]"
            >
              {isLoading ? <Spinner size={16} /> : 'Обновить подборку'}
            </button>
          </motion.div>
        )}
      </div>

      <div className="mt-4 flex items-center justify-center gap-6">
        <motion.button
          type="button"
          whileTap={reduceMotion ? undefined : { scale: 0.9 }}
          onClick={() => {
            void handleSwipe('left');
          }}
          disabled={!topItem || busy}
          aria-label="Пропустить"
          className="flex h-[62px] w-[62px] items-center justify-center rounded-full border border-slate-300/25 bg-tg-bg text-[26px] shadow-soft transition-opacity disabled:opacity-40"
        >
          <span aria-hidden="true">❌</span>
        </motion.button>

        <div className="flex flex-col items-center gap-0.5">
          <span
            aria-hidden="true"
            className="text-[11px] font-semibold text-tg-hint"
          >
            {busy ? 'Отправляем…' : 'Свайп вправо — хочу'}
          </span>
          <span
            aria-hidden="true"
            className="text-[10px] text-tg-hint/80"
          >
            влево — пропустить
          </span>
        </div>

        <motion.button
          type="button"
          whileTap={reduceMotion ? undefined : { scale: 0.9 }}
          onClick={() => {
            void handleSwipe('right');
          }}
          disabled={!topItem || busy}
          aria-label="Хочу"
          className="flex h-[62px] w-[62px] items-center justify-center rounded-full border border-rose-300/30 bg-gradient-to-br from-rose-500 to-orange-400 text-[26px] text-white shadow-glow transition-opacity disabled:opacity-40"
        >
          <span aria-hidden="true">❤️</span>
        </motion.button>
      </div>

      {topItem && isExhausted && busy === false ? (
        <p className="mt-3 text-center text-[10px] leading-4 text-tg-hint">
          Это последние карточки подборки
        </p>
      ) : null}

      <MatchModal
        match={activeMatch}
        open={matchOpen}
        onClose={() => {
          setMatchOpen(false);
          setActiveMatch(null);
        }}
      />

      <MatchesSheet
        open={matchesOpen}
        onClose={() => setMatchesOpen(false)}
      />
    </div>
  );
}
