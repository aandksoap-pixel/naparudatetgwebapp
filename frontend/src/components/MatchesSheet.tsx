import { useMemo, useState } from 'react';
import type { Category, MatchInfo } from '@/types/api';
import { api, getErrorMessage } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import { hapticError, hapticSelection, hapticSuccess } from '@/lib/haptics';
import { useApp } from '@/context/AppContext';
import { useToast } from '@/context/ToastContext';
import { ItemImage } from './ItemImage';
import { Spinner } from './LoadingScreen';
import { Modal } from './Modal';

interface MatchesSheetProps {
  open: boolean;
  onClose: () => void;
}

const CATEGORY_TABS: ReadonlyArray<{
  key: Category;
  label: string;
  icon: string;
  emptyTitle: string;
  emptyText: string;
}> = [
  {
    key: 'movie',
    label: 'Фильмы',
    icon: '🎬',
    emptyTitle: 'Мэтчей по фильмам пока нет',
    emptyText: 'Свайпайте вправо — когда партнёр тоже захочет фильм, он появится здесь.',
  },
  {
    key: 'food',
    label: 'Еда',
    icon: '🍕',
    emptyTitle: 'Мэтчей по еде пока нет',
    emptyText: 'Отметьте вкусняшки, которые хотите, и они совпадут с желаниями партнёра.',
  },
];

function MatchRow({
  match,
  busy,
  onToggle,
}: {
  match: MatchInfo;
  busy: boolean;
  onToggle: (match: MatchInfo) => void;
}): JSX.Element {
  return (
    <div className="flex gap-3 rounded-2xl border border-slate-300/15 bg-tg-section-bg/60 p-2.5">
      <ItemImage
        title={match.itemTitle}
        category={match.category}
        poster={match.itemPoster}
        showFallbackTitle={false}
        className="h-[76px] w-[58px] shrink-0 rounded-xl"
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <p className="line-clamp-2 text-[13px] font-semibold leading-5 text-tg-text">
          {match.itemTitle}
        </p>
        <p className="mt-0.5 text-[10px] leading-4 text-tg-hint">
          {formatDateTime(match.createdAt)}
          {match.isCompleted ? ' · выполнено' : ' · в планах'}
        </p>
        <div className="mt-auto pt-1.5">
          <button
            type="button"
            onClick={() => onToggle(match)}
            disabled={busy}
            className={`inline-flex min-h-[44px] items-center gap-1 rounded-full px-3 text-[11px] font-semibold transition-colors ${
              match.isCompleted
                ? 'border border-slate-300/25 bg-tg-secondary-bg/70 text-tg-hint'
                : 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
            }`}
          >
            {busy ? (
              <Spinner size={12} />
            ) : (
              <span aria-hidden="true">{match.isCompleted ? '↩️' : '✅'}</span>
            )}
            {match.isCompleted ? 'Вернуть' : 'Выполнено'}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Bottom sheet со всеми мэтчами пары и отметкой выполнения. */
export function MatchesSheet({ open, onClose }: MatchesSheetProps): JSX.Element {
  const { state, applyState } = useApp();
  const toast = useToast();
  const [category, setCategory] = useState<Category>('movie');
  const [busyId, setBusyId] = useState<string | null>(null);

  const matches = useMemo(() => {
    if (!state) return [];
    return [...state.matches]
      .filter((match) => match.category === category)
      .sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      );
  }, [state, category]);

  const activeTab = CATEGORY_TABS.find((tab) => tab.key === category);

  const handleToggle = async (match: MatchInfo): Promise<void> => {
    if (busyId) return;
    setBusyId(match.id);
    hapticSelection();
    try {
      const response = await api.completeMatch(match.id, !match.isCompleted);
      applyState(response.state);
      hapticSuccess();
      toast.success(
        match.isCompleted
          ? 'Мэтч снова в планах'
          : 'Отлично! Мэтч отмечен выполненным ✅',
      );
    } catch (error) {
      hapticError();
      toast.error(getErrorMessage(error));
    } finally {
      setBusyId(null);
    }
  };

  const totalCount = state?.matches.length ?? 0;

  return (
    <Modal
      open={open}
      onClose={onClose}
      variant="sheet"
      title="Наши мэтчи"
      description={
        totalCount > 0
          ? `Совпавших желаний: ${totalCount}. Отмечайте то, что уже сделали.`
          : 'Здесь появятся желания, которые вы выбрали оба.'
      }
    >
      <div className="mb-3 flex gap-1.5 rounded-2xl bg-tg-secondary-bg/60 p-1">
        {CATEGORY_TABS.map((tab) => {
          const isActive = tab.key === category;
          const count =
            state?.matches.filter((match) => match.category === tab.key)
              .length ?? 0;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => {
                if (!isActive) {
                  hapticSelection();
                  setCategory(tab.key);
                }
              }}
              className={`flex min-h-[44px] flex-1 items-center justify-center gap-1 rounded-xl text-xs font-semibold transition-colors ${
                isActive
                  ? 'bg-tg-bg text-tg-text shadow-soft'
                  : 'text-tg-hint'
              }`}
            >
              <span aria-hidden="true">{tab.icon}</span>
              {tab.label}
              {count > 0 ? (
                <span className="rounded-full bg-tg-secondary-bg px-1.5 text-[10px] text-tg-hint">
                  {count}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      {matches.length > 0 ? (
        <div className="space-y-2.5 pb-2">
          {matches.map((match) => (
            <MatchRow
              key={match.id}
              match={match}
              busy={busyId === match.id}
              onToggle={(item) => {
                void handleToggle(item);
              }}
            />
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center rounded-2xl border border-dashed border-slate-300/25 bg-tg-secondary-bg/25 px-5 py-10 text-center">
          <span aria-hidden="true" className="text-4xl">
            {activeTab?.icon === '🍕' ? '🍕' : '🎬'}
          </span>
          <p className="mt-3 text-sm font-semibold text-tg-text">
            {activeTab?.emptyTitle}
          </p>
          <p className="mt-1 max-w-[280px] text-xs leading-5 text-tg-hint">
            {activeTab?.emptyText}
          </p>
        </div>
      )}
    </Modal>
  );
}
