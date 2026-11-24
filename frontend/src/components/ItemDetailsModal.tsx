import type { SwipeItem } from '@/types/api';
import { formatNumber } from '@/lib/format';
import { hapticSelection } from '@/lib/haptics';
import { ItemImage } from './ItemImage';
import { Modal } from './Modal';

interface ItemDetailsModalProps {
  item: SwipeItem | null;
  open: boolean;
  onClose: () => void;
}

function InfoRow({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-slate-300/10 py-2 last:border-0">
      <span className="shrink-0 text-[11px] font-medium text-tg-hint">{label}</span>
      <span className="text-right text-xs font-semibold leading-5 text-tg-text">{value}</span>
    </div>
  );
}

/** Подробная карточка фильма или блюда: полное описание и метаданные. */
export function ItemDetailsModal({ item, open, onClose }: ItemDetailsModalProps): JSX.Element | null {
  if (!item) return null;

  const isMovie = item.category === 'movie';
  const title = item.title;
  const poster = isMovie ? item.poster : item.photo;
  const description = isMovie ? item.overview : item.details ?? item.description;
  const tags = isMovie ? item.genres : item.tags;

  return (
    <Modal
      open={open}
      onClose={onClose}
      variant="sheet"
      title={isMovie ? 'О фильме' : 'О блюде'}
      description={isMovie ? 'Всё, что стоит знать перед свайпом' : 'Состав, подача и настроение'}
    >
      <div className="relative overflow-hidden rounded-[24px] border border-slate-300/15">
        <ItemImage
          title={title}
          category={item.category}
          poster={poster}
          emoji={!isMovie ? item.emoji : undefined}
          className="aspect-[16/10] w-full"
          priority
          showFallbackTitle={false}
        />
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 to-transparent px-4 pb-3 pt-10">
          <h3 className="text-xl font-extrabold leading-6 text-white">{title}</h3>
          {isMovie && item.originalTitle ? (
            <p className="mt-0.5 text-[11px] font-medium text-white/60">{item.originalTitle}</p>
          ) : null}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {isMovie ? (
          <>
            {item.year ? <span className="chip">{item.year}</span> : null}
            <span className="chip">⭐ {item.rating.toFixed(1)}</span>
          </>
        ) : (
          <>
            <span className="chip">{item.cuisine}</span>
            {item.calories ? <span className="chip">~{item.calories} ккал</span> : null}
            {item.prepTime ? <span className="chip">~{item.prepTime} мин</span> : null}
          </>
        )}
        {tags.map((tag) => (
          <span key={tag} className="chip">
            {tag}
          </span>
        ))}
      </div>

      <div className="mt-4">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-tg-hint">
          {isMovie ? 'Описание' : 'Почему стоит попробовать'}
        </p>
        <p className="mt-1.5 whitespace-pre-line text-sm leading-6 text-tg-text/90">{description}</p>
      </div>

      {!isMovie ? (
        <div className="mt-4 rounded-2xl bg-tg-secondary-bg/50 px-3.5 py-2">
          {item.portion ? <InfoRow label="Порция" value={item.portion} /> : null}
          {item.spiceLevel ? <InfoRow label="Острота" value={item.spiceLevel} /> : null}
          {item.pairing ? <InfoRow label="Хорошо с" value={item.pairing} /> : null}
          <InfoRow label="Кухня" value={item.cuisine} />
        </div>
      ) : (
        <div className="mt-4 rounded-2xl bg-tg-secondary-bg/50 px-3.5 py-2">
          <InfoRow label="Год" value={item.year ? String(item.year) : '—'} />
          <InfoRow
            label="Рейтинг"
            value={`${item.rating.toFixed(1)} / 10${item.imdbRating ? ` · IMDb ${item.imdbRating.toFixed(1)}` : ''}`}
          />
          <InfoRow label="Жанры" value={item.genres.length > 0 ? item.genres.join(', ') : '—'} />
          {item.runtime ? <InfoRow label="Длительность" value={item.runtime} /> : null}
          {item.director ? <InfoRow label="Режиссёр" value={item.director} /> : null}
          {item.country ? <InfoRow label="Страна" value={item.country} /> : null}
          {item.cast && item.cast.length > 0 ? (
            <InfoRow label="В ролях" value={item.cast.join(', ')} />
          ) : null}
          {item.originalTitle ? <InfoRow label="Оригинал" value={item.originalTitle} /> : null}
        </div>
      )}

      <button
        type="button"
        onClick={() => {
          hapticSelection();
          onClose();
        }}
        className="btn btn-primary mt-4 w-full"
      >
        Вернуться к свайпам
      </button>
      <p className="mt-2 pb-1 text-center text-[10px] leading-4 text-tg-hint">
        {isMovie ? 'Данные о фильме: TMDB' : `Блюдо · ${formatNumber(item.calories ?? 0)} ккал`}
      </p>
    </Modal>
  );
}
