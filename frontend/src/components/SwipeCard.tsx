import { useEffect } from 'react';
import {
  animate,
  motion,
  useMotionValue,
  useReducedMotion,
  useTransform,
} from 'framer-motion';
import type { SwipeDirection, SwipeItem } from '@/types/api';
import { ItemImage } from './ItemImage';

const SWIPE_DISTANCE = 110;
const SWIPE_VELOCITY = 520;

interface SwipeCardProps {
  item: SwipeItem;
  onSwipe: (direction: SwipeDirection) => void;
  interactive: boolean;
  disabled: boolean;
  exitDirection: SwipeDirection | null;
  stackIndex: number;
}

export function itemMeta(item: SwipeItem): string {
  if (item.category === 'movie') {
    const parts: string[] = [];
    if (item.year) parts.push(String(item.year));
    if (item.rating > 0) parts.push(`⭐ ${item.rating.toFixed(1)}`);
    return parts.join(' · ');
  }
  return item.cuisine;
}

export function itemTags(item: SwipeItem): string[] {
  return item.category === 'movie' ? item.genres.slice(0, 3) : item.tags.slice(0, 3);
}

export function itemDescription(item: SwipeItem): string {
  return item.category === 'movie' ? item.overview : item.description;
}

/** Одна карточка колоды с drag-механикой и возвратом при ошибке. */
export function SwipeCard({
  item,
  onSwipe,
  interactive,
  disabled,
  exitDirection,
  stackIndex,
}: SwipeCardProps): JSX.Element {
  const reduceMotion = useReducedMotion();
  const x = useMotionValue(0);
  const rotate = useTransform(x, [-260, 260], [-13, 13]);
  const likeOpacity = useTransform(x, [16, 110], [0, 1]);
  const skipOpacity = useTransform(x, [-110, -16], [1, 0]);
  const cardScale = stackIndex === 0 ? 1 : 1 - stackIndex * 0.045;
  const cardY = stackIndex === 0 ? 0 : stackIndex * 9;

  useEffect(() => {
    if (!interactive) return;
    if (exitDirection) {
      const target = exitDirection === 'right' ? 680 : -680;
      const controls = animate(x, target, {
        duration: reduceMotion ? 0.01 : 0.26,
        ease: [0.22, 1, 0.36, 1],
      });
      return () => controls.stop();
    }
    const controls = animate(x, 0, {
      type: 'spring',
      stiffness: 320,
      damping: 30,
    });
    return () => controls.stop();
  }, [exitDirection, interactive, reduceMotion, x]);

  const poster =
    item.category === 'movie' ? item.poster : item.photo;
  const emoji = item.category === 'food' ? item.emoji : '🎬';
  const categoryLabel = item.category === 'movie' ? 'ФИЛЬМ' : 'ЕДА';
  const title = item.title;
  const meta = itemMeta(item);
  const tags = itemTags(item);
  const description = itemDescription(item);

  return (
    <motion.div
      className="absolute inset-0"
      style={{ zIndex: 30 - stackIndex }}
      animate={{ scale: cardScale, y: cardY, opacity: 1 }}
      transition={{ type: 'spring', stiffness: 320, damping: 32 }}
    >
      <motion.div
        className="relative h-full w-full touch-pan-y"
        style={{ x, rotate }}
        drag={interactive && !disabled ? 'x' : false}
        dragSnapToOrigin={false}
        dragMomentum={false}
        dragElastic={0.82}
        dragConstraints={{ left: 0, right: 0 }}
        whileDrag={{ cursor: 'grabbing' }}
        onDragEnd={(_, info) => {
          if (!interactive || disabled) return;
          const threshold = Math.min(SWIPE_DISTANCE, window.innerWidth * 0.3);
          if (info.offset.x > threshold || info.velocity.x > SWIPE_VELOCITY) {
            onSwipe('right');
          } else if (
            info.offset.x < -threshold ||
            info.velocity.x < -SWIPE_VELOCITY
          ) {
            onSwipe('left');
          } else {
            animate(x, 0, { type: 'spring', stiffness: 340, damping: 30 });
          }
        }}
      >
        <div className="relative flex h-full w-full flex-col overflow-hidden rounded-[28px] border border-white/10 bg-slate-900 shadow-card">
          <ItemImage
            title={title}
            category={item.category}
            poster={poster}
            emoji={emoji}
            priority={stackIndex === 0}
            showFallbackTitle={false}
            className="absolute inset-0 h-full w-full"
          />

          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/50 via-black/5 to-black/90"
          />

          <div className="relative z-10 flex items-start justify-between gap-2 p-3.5">
            <span className="rounded-full border border-white/20 bg-black/35 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-white/90 backdrop-blur-sm">
              {categoryLabel}
            </span>
            {meta ? (
              <span className="rounded-full border border-white/20 bg-black/35 px-2.5 py-1 text-[11px] font-semibold text-white/90 backdrop-blur-sm">
                {meta}
              </span>
            ) : null}
          </div>

          <div className="relative z-10 mt-auto px-5 pb-5">
            <h3 className="line-clamp-2 text-[23px] font-extrabold leading-[1.15] tracking-tight text-white drop-shadow">
              {title}
            </h3>

            {item.category === 'movie' && item.originalTitle ? (
              <p className="mt-0.5 truncate text-[11px] font-medium text-white/55">
                {item.originalTitle}
              </p>
            ) : null}

            {tags.length > 0 ? (
              <div className="mt-2.5 flex flex-wrap gap-1.5">
                {tags.map((tag) => (
                  <span
                    key={tag}
                    className="rounded-full border border-white/15 bg-white/10 px-2 py-0.5 text-[10px] font-medium text-white/85 backdrop-blur-sm"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            ) : null}

            {description ? (
              <p className="mt-2.5 line-clamp-2 text-[11.5px] leading-[1.55] text-white/70">
                {description}
              </p>
            ) : null}
          </div>

          <motion.div
            aria-hidden="true"
            style={{ opacity: likeOpacity }}
            className="pointer-events-none absolute left-4 top-1/2 z-20 -translate-y-1/2 -rotate-12 rounded-xl border-[3px] border-emerald-400 px-3 py-1.5 text-lg font-extrabold uppercase tracking-wider text-emerald-400 shadow-lg"
          >
            Хочу
          </motion.div>
          <motion.div
            aria-hidden="true"
            style={{ opacity: skipOpacity }}
            className="pointer-events-none absolute right-4 top-1/2 z-20 -translate-y-1/2 rotate-12 rounded-xl border-[3px] border-rose-400 px-3 py-1.5 text-lg font-extrabold uppercase tracking-wider text-rose-400 shadow-lg"
          >
            Пропуск
          </motion.div>
        </div>
      </motion.div>
    </motion.div>
  );
}
