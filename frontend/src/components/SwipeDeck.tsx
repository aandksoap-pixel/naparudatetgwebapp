import type { SwipeDirection, SwipeItem } from '@/types/api';
import { SwipeCard } from './SwipeCard';

interface SwipeDeckProps {
  items: SwipeItem[];
  busy: boolean;
  exitDirection: SwipeDirection | null;
  onSwipe: (direction: SwipeDirection) => void;
  onDetails: (item: SwipeItem) => void;
}

/**
 * Стек до 3 карточек. Верхняя — интерактивная, следующие уменьшены
 * и подсвечены как «следующие в колоде».
 */
export function SwipeDeck({
  items,
  busy,
  exitDirection,
  onSwipe,
  onDetails,
}: SwipeDeckProps): JSX.Element {
  const visible = items.slice(0, 3);

  return (
    <div className="relative h-[clamp(330px,56vh,540px)] w-full select-none">
      {visible
        .map((item, index) => ({ item, index }))
        .reverse()
        .map(({ item, index }) => {
          const isTop = index === 0;
          return (
            <SwipeCard
              key={item.id}
              item={item}
              stackIndex={index}
              interactive={isTop}
              disabled={busy}
              exitDirection={isTop ? exitDirection : null}
              onSwipe={onSwipe}
              onDetails={onDetails}
            />
          );
        })}
    </div>
  );
}
