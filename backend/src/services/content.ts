/**
 * Каталог контента для свайпов.
 *
 * Фильмы: TMDB (ru-RU, кэш 30 минут, таймаут запроса) с fallback на
 * локальный src/data/movies.json (70 популярных фильмов, постер может быть
 * пустым — фронтенд рисует стилизованную карточку).
 * Еда: локальный src/data/food.json (70+ карточек с Unsplash-фото и emoji).
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { config } from '../config.js';
import { appErrors } from '../lib/errors.js';
import { fetchJson } from '../lib/http.js';
import { logger } from '../lib/logger.js';
import type { FoodCard, MovieCard } from '../types.js';

const MOVIES_CACHE_TTL_MS = 30 * 60 * 1000;
const TMDB_BASE = 'https://api.themoviedb.org/3';
const TMDB_IMAGE_BASE = 'https://image.tmdb.org/t/p/w500';
const TMDB_TIMEOUT_MS = 8_000;
const TMDB_PAGES = [1, 2, 3, 4, 5] as const;

/** Русские названия жанров TMDB (genre_ids из /trending). */
const TMDB_GENRES: Record<number, string> = {
  28: 'Боевик',
  12: 'Приключения',
  16: 'Мультфильм',
  35: 'Комедия',
  80: 'Криминал',
  99: 'Документальный',
  18: 'Драма',
  10751: 'Семейный',
  14: 'Фэнтези',
  36: 'История',
  27: 'Ужасы',
  10402: 'Музыка',
  9648: 'Детектив',
  10749: 'Мелодрама',
  878: 'Фантастика',
  10770: 'ТВ-фильм',
  53: 'Триллер',
  10752: 'Военный',
  37: 'Вестерн',
};

/** Перемешивает массив на месте (Fisher–Yates). */
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

// ---------------------------------------------------------------------------
// Чтение локальных JSON (работает и в tsx, и в собранном dist)
// ---------------------------------------------------------------------------

function readJsonData(fileName: string): unknown {
  const moduleDir = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    resolve(moduleDir, '..', 'data', fileName), // src/services -> src/data
    resolve(moduleDir, '..', '..', 'src', 'data', fileName), // dist/services -> src/data
    resolve(process.cwd(), 'src', 'data', fileName),
    resolve(process.cwd(), 'backend', 'src', 'data', fileName),
  ];

  let lastError: unknown = null;
  for (const candidate of candidates) {
    try {
      return JSON.parse(readFileSync(candidate, 'utf8')) as unknown;
    } catch (error) {
      lastError = error;
    }
  }
  throw new Error(`Не удалось прочитать data/${fileName}: ${String(lastError)}`);
}

// ---------------------------------------------------------------------------
// Фильмы: TMDB
// ---------------------------------------------------------------------------

interface TmdbMovieRaw {
  id?: number;
  title?: string;
  original_title?: string;
  overview?: string;
  poster_path?: string | null;
  release_date?: string;
  vote_average?: number;
  genre_ids?: number[];
}

interface TmdbListResponse {
  results?: TmdbMovieRaw[];
}

function tmdbConfigured(): boolean {
  return Boolean(config.tmdb.accessToken || config.tmdb.apiKey);
}

function tmdbHeaders(): Record<string, string> {
  const headers: Record<string, string> = { accept: 'application/json' };
  if (config.tmdb.accessToken) {
    headers.Authorization = `Bearer ${config.tmdb.accessToken}`;
  }
  return headers;
}

async function fetchTmdbPage(page: number): Promise<TmdbMovieRaw[]> {
  const url = new URL(`${TMDB_BASE}/trending/movie/week`);
  url.searchParams.set('language', 'ru-RU');
  url.searchParams.set('page', String(page));
  if (!config.tmdb.accessToken && config.tmdb.apiKey) {
    url.searchParams.set('api_key', config.tmdb.apiKey);
  }
  const data = await fetchJson<TmdbListResponse>(url.toString(), {
    headers: tmdbHeaders(),
    timeoutMs: TMDB_TIMEOUT_MS,
  });
  return Array.isArray(data.results) ? data.results : [];
}

function toMovieCard(raw: TmdbMovieRaw): MovieCard | null {
  const id = raw.id;
  const title = raw.title?.trim() ?? raw.original_title?.trim() ?? '';
  if (typeof id !== 'number' || id <= 0 || title.length === 0) return null;

  const releaseDate = raw.release_date?.trim() ?? '';
  const year = /^\d{4}/.test(releaseDate) ? Number.parseInt(releaseDate.slice(0, 4), 10) : null;
  const voteAverage =
    typeof raw.vote_average === 'number' && Number.isFinite(raw.vote_average)
      ? raw.vote_average
      : 0;
  const genreIds = Array.isArray(raw.genre_ids) ? raw.genre_ids : [];
  const genres = genreIds
    .map((genreId) => TMDB_GENRES[genreId])
    .filter((name): name is string => typeof name === 'string')
    .slice(0, 3);
  const posterPath = typeof raw.poster_path === 'string' ? raw.poster_path : '';

  return {
    id: `tmdb_${id}`,
    category: 'movie',
    title,
    originalTitle: raw.original_title?.trim() ? raw.original_title.trim() : null,
    overview: raw.overview?.trim() ? raw.overview.trim() : 'Описание пока недоступно.',
    poster: posterPath ? `${TMDB_IMAGE_BASE}${posterPath}` : '',
    year,
    rating: Math.round(voteAverage * 10) / 10,
    genres,
  };
}

async function loadTmdbMovies(): Promise<MovieCard[] | null> {
  if (!tmdbConfigured()) return null;
  try {
    const pages = await Promise.all(
      TMDB_PAGES.map((page) => fetchTmdbPage(page).catch(() => [] as TmdbMovieRaw[])),
    );
    const seen = new Set<number>();
    const cards: MovieCard[] = [];
    for (const raw of pages.flat()) {
      if (typeof raw.id !== 'number' || seen.has(raw.id)) continue;
      const card = toMovieCard(raw);
      if (!card) continue;
      seen.add(raw.id);
      cards.push(card);
    }
    if (cards.length === 0) {
      logger.warn('TMDB вернул пустой каталог — используем локальный fallback');
      return null;
    }
    return cards;
  } catch (error) {
    logger.warn({ err: error }, 'Не удалось загрузить фильмы из TMDB — используем fallback');
    return null;
  }
}

// ---------------------------------------------------------------------------
// Фильмы: локальный fallback
// ---------------------------------------------------------------------------

const fallbackMovieSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  originalTitle: z.string().nullable().optional(),
  overview: z.string().optional().default(''),
  year: z.number().int().nullable().optional(),
  rating: z.number().optional(),
  genres: z.array(z.string()).optional().default([]),
  poster: z.string().optional().default(''),
  runtime: z.string().optional(),
  director: z.string().optional(),
  cast: z.array(z.string()).optional(),
  country: z.string().optional(),
  imdbRating: z.number().optional(),
});

let fallbackMoviesCache: MovieCard[] | null = null;

function loadFallbackMovies(): MovieCard[] {
  if (fallbackMoviesCache) return fallbackMoviesCache;

  const parsed = z.array(fallbackMovieSchema).safeParse(readJsonData('movies.json'));
  if (!parsed.success) {
    logger.error({ issues: parsed.error.issues }, 'Некорректный fallback-каталог фильмов');
    throw appErrors.internal('Каталог фильмов временно недоступен');
  }

  fallbackMoviesCache = parsed.data.map((movie) => ({
    id: movie.id,
    category: 'movie',
    title: movie.title,
    originalTitle: movie.originalTitle ?? null,
    overview: movie.overview.length > 0 ? movie.overview : 'Описание пока недоступно.',
    poster: movie.poster,
    year: movie.year ?? null,
    rating: movie.rating ?? 0,
    genres: movie.genres,
    runtime: movie.runtime,
    director: movie.director,
    cast: movie.cast,
    country: movie.country,
    imdbRating: movie.imdbRating,
  }));

  return fallbackMoviesCache;
}

// ---------------------------------------------------------------------------
// Общий кэш каталога фильмов
// ---------------------------------------------------------------------------

interface MoviesCache {
  items: MovieCard[];
  source: 'tmdb' | 'fallback';
  expiresAt: number;
}

let moviesCache: MoviesCache | null = null;

async function loadMoviesCatalog(): Promise<{ items: MovieCard[]; source: 'tmdb' | 'fallback' }> {
  try {
    const remote = await loadTmdbMovies();
    if (remote && remote.length > 0) {
      return { items: remote, source: 'tmdb' };
    }
    return { items: loadFallbackMovies(), source: 'fallback' };
  } catch (error) {
    logger.error({ err: error }, 'Каталог фильмов недоступен');
    throw appErrors.internal('Каталог фильмов временно недоступен');
  }
}

export async function getMovies(
  limit: number,
  excludeIds: ReadonlySet<string>,
): Promise<{ items: MovieCard[]; source: 'tmdb' | 'fallback' }> {
  const now = Date.now();
  let cache = moviesCache;
  if (!cache || cache.expiresAt <= now) {
    const fresh = await loadMoviesCatalog();
    cache = {
      items: fresh.items,
      source: fresh.source,
      expiresAt: now + MOVIES_CACHE_TTL_MS,
    };
    moviesCache = cache;
  }

  const available = cache.items.filter((movie) => !excludeIds.has(movie.id));
  shuffle(available);

  return { items: available.slice(0, limit), source: cache.source };
}

// ---------------------------------------------------------------------------
// Еда: локальный каталог
// ---------------------------------------------------------------------------

const fallbackFoodSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  cuisine: z.string().min(1),
  tags: z.array(z.string()).optional().default([]),
  description: z.string().optional().default(''),
  photo: z.string().optional().default(''),
  emoji: z.string().optional().default('🍽️'),
  calories: z.number().int().optional(),
  prepTime: z.number().int().optional(),
  portion: z.string().optional(),
  spiceLevel: z.string().optional(),
  pairing: z.string().optional(),
  details: z.string().optional(),
});

let foodCatalogCache: FoodCard[] | null = null;

function loadFoodCatalog(): FoodCard[] {
  if (foodCatalogCache) return foodCatalogCache;

  const parsed = z.array(fallbackFoodSchema).safeParse(readJsonData('food.json'));
  if (!parsed.success) {
    logger.error({ issues: parsed.error.issues }, 'Некорректный локальный каталог еды');
    throw appErrors.internal('Каталог еды временно недоступен');
  }

  foodCatalogCache = parsed.data.map((item) => ({
    id: item.id,
    category: 'food',
    title: item.title,
    cuisine: item.cuisine,
    tags: item.tags,
    description: item.description,
    photo: item.photo,
    emoji: item.emoji,
    calories: item.calories,
    prepTime: item.prepTime,
    portion: item.portion,
    spiceLevel: item.spiceLevel,
    pairing: item.pairing,
    details: item.details,
  }));

  return foodCatalogCache;
}

export function getFood(
  limit: number,
  excludeIds: ReadonlySet<string>,
): { items: FoodCard[]; source: 'local' } {
  try {
    const available = loadFoodCatalog().filter((item) => !excludeIds.has(item.id));
    shuffle(available);
    return { items: available.slice(0, limit), source: 'local' };
  } catch (error) {
    logger.error({ err: error }, 'Каталог еды недоступен');
    throw appErrors.internal('Каталог еды временно недоступен');
  }
}
