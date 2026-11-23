import type { PlanType } from '@/types/api';
import { planLabel } from '@/lib/format';

interface PlanBadgeProps {
  plan: PlanType;
  size?: 'sm' | 'md';
  className?: string;
}

const PLAN_STYLES: Record<
  ReturnType<typeof planLabel>,
  { wrapper: string; star: string }
> = {
  FREE: {
    wrapper:
      'border-slate-300/30 bg-tg-secondary-bg/80 text-tg-hint',
    star: '',
  },
  TRIAL: {
    wrapper:
      'border-amber-400/40 bg-amber-400/15 text-amber-600 dark:text-amber-300',
    star: '⏳',
  },
  PRO: {
    wrapper: 'brand-gradient border-transparent text-white shadow-soft',
    star: '✨',
  },
};

/** Бейдж тарифа FREE / TRIAL / PRO. */
export function PlanBadge({
  plan,
  size = 'sm',
  className = '',
}: PlanBadgeProps): JSX.Element {
  const label = planLabel(plan);
  const style = PLAN_STYLES[label];

  return (
    <span
      title={`Тариф: ${label}`}
      className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full border font-bold tracking-wide ${
        size === 'sm'
          ? 'px-2 py-0.5 text-[10px] leading-4'
          : 'px-2.5 py-1 text-[11px] leading-4'
      } ${style.wrapper} ${className}`}
    >
      {style.star ? <span aria-hidden="true">{style.star}</span> : null}
      {label}
    </span>
  );
}
