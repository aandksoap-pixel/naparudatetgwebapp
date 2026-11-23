/** Свайпы: лимиты, мэтчи, уведомления ботом. */
import type { FastifyPluginAsync } from 'fastify';
import { getAuth, requireTelegramAuth } from '../lib/auth.js';
import { parseInput, swipeSchema } from '../lib/validation.js';
import { buildState, toMatchInfo } from '../services/state.js';
import { processSwipe } from '../services/swipes.js';

export const swipeRoutes: FastifyPluginAsync = async (app) => {
  app.post('/swipes', { preHandler: requireTelegramAuth }, async (request) => {
    const auth = getAuth(request);
    const input = parseInput(swipeSchema, request.body);

    const outcome = await processSwipe(auth.userId, {
      category: input.category,
      itemId: input.itemId,
      itemTitle: input.itemTitle,
      itemPoster: input.itemPoster,
      direction: input.direction,
    });

    const state = await buildState(auth.userId);
    return {
      state,
      match: outcome.match ? toMatchInfo(outcome.match) : null,
      isMatch: outcome.isMatch,
      newMatch: outcome.newMatch,
    };
  });
};
