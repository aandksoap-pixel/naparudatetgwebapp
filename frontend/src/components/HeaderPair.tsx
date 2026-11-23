import type { AppState, UserProfile } from '@/types/api';
import { formatDays, getMoodDisplay } from '@/lib/format';
import { Avatar } from './Avatar';
import { PlanBadge } from './PlanBadge';

interface HeaderPairProps {
  state: AppState;
  onOpenMood: () => void;
}

interface PersonBlockProps {
  user: UserProfile | null;
  align: 'left' | 'right';
  onMoodClick: () => void;
  fallbackName: string;
}

function PersonBlock({
  user,
  align,
  onMoodClick,
  fallbackName,
}: PersonBlockProps): JSX.Element {
  const name = user?.firstName ?? fallbackName;
  const mood = user
    ? getMoodDisplay(user.moodStatus, user.moodText)
    : { emoji: '⏳', label: 'ждём' };

  return (
    <div
      className={`flex min-w-0 flex-1 items-center gap-1.5 ${
        align === 'right' ? 'flex-row-reverse' : ''
      }`}
    >
      <Avatar name={name} src={user?.avatarUrl ?? null} size={34} ring />
      <div
        className={`min-w-0 ${align === 'right' ? 'text-right' : 'text-left'}`}
      >
        <p className="truncate text-[12.5px] font-semibold leading-4 text-tg-text">
          {name}
        </p>
        <button
          type="button"
          onClick={onMoodClick}
          aria-label={`Настроение ${name}: ${mood.label}`}
          className={`tap-scale -my-2 inline-flex min-h-[44px] max-w-full items-center gap-1 rounded-full text-[10.5px] font-medium leading-4 text-tg-hint ${
            align === 'right' ? 'flex-row-reverse' : ''
          }`}
        >
          <span aria-hidden="true" className="text-[11px]">
            {mood.emoji}
          </span>
          <span className="truncate">{mood.label}</span>
        </button>
      </div>
    </div>
  );
}

/** Компактная «шапка пары»: дни вместе, тариф, аватары, имена, настроение. */
export function HeaderPair({ state, onOpenMood }: HeaderPairProps): JSX.Element {
  const { user, partner, pair, subscription } = state;
  const days = pair?.daysTogether ?? null;

  return (
    <header className="glass safe-top sticky top-0 z-40">
      <div className="mx-auto w-full max-w-[520px] px-4 pb-2 pt-1">
        <div className="flex items-center justify-between gap-2">
          <p className="truncate text-[10px] font-medium leading-4 text-tg-hint">
            {days !== null ? `Вместе ${formatDays(days)}` : 'Ваша пара'}
          </p>
          <PlanBadge plan={subscription.plan} size="sm" />
        </div>

        <div className="mt-1 flex items-center gap-1.5">
          <PersonBlock
            user={user}
            align="left"
            onMoodClick={onOpenMood}
            fallbackName="Вы"
          />
          <span
            aria-hidden="true"
            className="-mx-0.5 shrink-0 text-sm leading-none"
          >
            💞
          </span>
          <PersonBlock
            user={partner}
            align="right"
            onMoodClick={onOpenMood}
            fallbackName="Партнёр"
          />
        </div>
      </div>
    </header>
  );
}
