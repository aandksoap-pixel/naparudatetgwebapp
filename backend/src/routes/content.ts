/**
 * Контент для свайпов: фильмы (TMDB + fallback) и еда (локальный каталог).
 * Уже свайпнутые текущим пользователем карточки исключаются.
 */
import type { FastifyPluginAsync } from 'fastify';
import { getAuth, requireTelegramAuth } from '../lib/auth.js';
import { contentQuerySchema, parseInput } from '../lib/validation.js';
import { getFood, getMovies } from '../services/content.js';
import { getSwipedItemIds } from '../services/swipes.js';

export const contentRoutes: FastifyPluginAsync = async (app) => {
  app.get('/content/movies', { preHandler: requireTelegramAuth }, async (request) => {
    const auth = getAuth(request);
    const query = parseInput(contentQuerySchema, request.query);
    const excludeIds = await getSwipedItemIds(auth.userId, 'movie');
    return getMovies(query.limit, excludeIds);
  });

  app.get('/content/food', { preHandler: requireTelegramAuth }, async (request) => {
    const auth = getAuth(request);
    const query = parseInput(contentQuerySchema, request.query);
    const excludeIds = await getSwipedItemIds(auth.userId, 'food');
    return getFood(query.limit, excludeIds);
  });
};
