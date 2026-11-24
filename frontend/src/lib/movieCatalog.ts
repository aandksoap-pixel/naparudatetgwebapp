import type { MovieCard } from '@/types/api';

let cache: MovieCard[] | null = null;
let loading: Promise<MovieCard[]> | null = null;

function toMovieCard(value: Record<string, unknown>): MovieCard | null {
  if (typeof value.id !== 'string' || typeof value.title !== 'string') return null;
  return {
    id: value.id,
    category: 'movie',
    title: value.title,
    originalTitle: typeof value.originalTitle === 'string' ? value.originalTitle : null,
    overview: typeof value.overview === 'string' ? value.overview : '',
    poster: typeof value.poster === 'string' ? value.poster : '',
    year: typeof value.year === 'number' ? value.year : null,
    rating: typeof value.rating === 'number' ? value.rating : 0,
    genres: Array.isArray(value.genres)
      ? value.genres.filter((item): item is string => typeof item === 'string')
      : [],
    runtime: typeof value.runtime === 'string' ? value.runtime : undefined,
    director: typeof value.director === 'string' ? value.director : undefined,
    cast: Array.isArray(value.cast)
      ? value.cast.filter((item): item is string => typeof item === 'string')
      : undefined,
    country: typeof value.country === 'string' ? value.country : undefined,
    imdbRating: typeof value.imdbRating === 'number' ? value.imdbRating : undefined,
  };
}

async function loadCatalog(): Promise<MovieCard[]> {
  if (cache) return cache;
  if (!loading) {
    loading = fetch(`${import.meta.env.BASE_URL}movies.json`, {
      headers: { Accept: 'application/json' },
    })
      .then(async (response) => {
        if (!response.ok) throw new Error(`movies.json: HTTP ${response.status}`);
        const raw = (await response.json()) as unknown;
        if (!Array.isArray(raw)) throw new Error('movies.json: invalid format');
        const items = raw
          .map((item) =>
            typeof item === 'object' && item !== null
              ? toMovieCard(item as Record<string, unknown>)
              : null,
          )
          .filter((item): item is MovieCard => item !== null);
        if (items.length === 0) throw new Error('movies.json: empty');
        cache = items;
        return items;
      })
      .finally(() => {
        loading = null;
      });
  }
  return loading;
}

function shuffle<T>(items: T[]): T[] {
  for (let index = items.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    const current = items[index];
    const other = items[swapIndex];
    if (current !== undefined && other !== undefined) {
      items[index] = other;
      items[swapIndex] = current;
    }
  }
  return items;
}

/** Случайная порция фильмов из локального каталога (108 карточек с постерами). */
export async function loadMovieDeck(
  limit: number,
  excludeIds: ReadonlySet<string>,
): Promise<MovieCard[]> {
  const catalog = await loadCatalog();
  return shuffle(catalog.filter((movie) => !excludeIds.has(movie.id))).slice(0, limit);
}
