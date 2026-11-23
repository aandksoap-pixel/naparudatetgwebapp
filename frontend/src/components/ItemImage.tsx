import { useEffect, useMemo, useState } from 'react';
import type { Category } from '@/types/api';

const POSTER_GRADIENTS = [
  'linear-gradient(150deg, #1e1b4b 0%, #be123c 55%, #fb923c 100%)',
  'linear-gradient(150deg, #0f172a 0%, #7c3aed 55%, #f472b6 100%)',
  'linear-gradient(150deg, #082f49 0%, #0369a1 50%, #22d3ee 100%)',
  'linear-gradient(150deg, #3f1d0b 0%, #b45309 55%, #fbbf24 100%)',
  'linear-gradient(150deg, #052e16 0%, #15803d 55%, #86efac 100%)',
  'linear-gradient(150deg, #2e1065 0%, #9333ea 55%, #f0abfc 100%)',
];

function hashString(value: string): number {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 37 + value.charCodeAt(index)) >>> 0;
  }
  return hash;
}

interface ItemImageProps {
  title: string;
  category: Category;
  poster?: string | null;
  emoji?: string;
  className?: string;
  priority?: boolean;
  showFallbackTitle?: boolean;
}

/**
 * Постер фильма / фото еды. Если ссылка пустая или битая —
 * показываем стилизованный градиент с emoji и названием.
 */
export function ItemImage({
  title,
  category,
  poster,
  emoji,
  className = '',
  priority = false,
  showFallbackTitle = true,
}: ItemImageProps): JSX.Element {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [poster]);

  const gradient = useMemo(
    () => POSTER_GRADIENTS[hashString(title || 'item') % POSTER_GRADIENTS.length],
    [title],
  );
  const fallbackEmoji = emoji ?? (category === 'movie' ? '🎬' : '🍽️');
  const showImage = Boolean(poster) && !failed;

  return (
    <div
      className={`relative isolate overflow-hidden bg-slate-900 ${className}`}
      style={{ backgroundImage: showImage ? undefined : gradient }}
    >
      {showImage ? (
        <img
          src={poster ?? ''}
          alt={title}
          loading={priority ? 'eager' : 'lazy'}
          decoding="async"
          draggable={false}
          className="h-full w-full select-none object-cover"
          onError={() => setFailed(true)}
        />
      ) : (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-5 text-center">
          <span
            aria-hidden="true"
            className="text-[clamp(2.5rem,12vw,4rem)] leading-none drop-shadow-lg"
          >
            {fallbackEmoji}
          </span>
          {showFallbackTitle ? (
            <span className="line-clamp-3 max-w-full text-balance text-base font-bold leading-tight text-white/95 drop-shadow">
              {title}
            </span>
          ) : null}
          {showFallbackTitle ? (
            <span className="text-[10px] font-medium uppercase tracking-[0.18em] text-white/60">
              {category === 'movie' ? 'Кино для двоих' : 'Вкусный выбор'}
            </span>
          ) : null}
        </div>
      )}
    </div>
  );
}
