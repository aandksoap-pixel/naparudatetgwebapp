import { motion, useReducedMotion } from 'framer-motion';
import { hapticSelection } from '@/lib/haptics';

export type TabKey = 'swipes' | 'mood' | 'reminders' | 'profile';

interface TabDefinition {
  key: TabKey;
  label: string;
  icon: string;
}

export const TABS: readonly TabDefinition[] = [
  { key: 'swipes', label: 'Свайпы', icon: '🎬' },
  { key: 'mood', label: 'Настроение', icon: '💭' },
  { key: 'reminders', label: 'Напоминания', icon: '🔔' },
  { key: 'profile', label: 'Профиль', icon: '👤' },
];

interface BottomNavProps {
  activeTab: TabKey;
  onChange: (tab: TabKey) => void;
}

/** Нижняя навигация с анимированным активным pill и haptic-откликом. */
export function BottomNav({ activeTab, onChange }: BottomNavProps): JSX.Element {
  const reduceMotion = useReducedMotion();

  return (
    <nav
      aria-label="Основная навигация"
      className="glass-nav fixed inset-x-0 bottom-0 z-40"
      style={{ paddingBottom: 'var(--safe-bottom)' }}
    >
      <div className="mx-auto flex w-full max-w-[520px] items-stretch gap-1 px-2 pb-1.5 pt-1.5">
        {TABS.map((tab) => {
          const isActive = tab.key === activeTab;
          return (
            <button
              key={tab.key}
              type="button"
              aria-current={isActive ? 'page' : undefined}
              onClick={() => {
                if (isActive) return;
                hapticSelection();
                onChange(tab.key);
              }}
              className={`relative isolate flex min-h-[52px] flex-1 flex-col items-center justify-center gap-0.5 rounded-2xl px-1 transition-colors ${
                isActive ? 'text-tg-text' : 'text-tg-hint'
              }`}
            >
              {isActive ? (
                <motion.span
                  aria-hidden="true"
                  layoutId="bottom-nav-active"
                  className="absolute inset-0 -z-10 rounded-2xl bg-tg-secondary-bg/90 shadow-soft"
                  transition={
                    reduceMotion
                      ? { duration: 0 }
                      : { type: 'spring', stiffness: 420, damping: 34 }
                  }
                />
              ) : null}
              <span
                aria-hidden="true"
                className={`text-[17px] leading-5 transition-transform ${
                  isActive ? 'scale-110' : ''
                }`}
              >
                {tab.icon}
              </span>
              <span
                className={`text-[10px] leading-3 ${
                  isActive ? 'font-semibold' : 'font-medium'
                }`}
              >
                {tab.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
