/** GET /api/state — полный снимок AppState. */
import type { FastifyPluginAsync } from 'fastify';
import { getAuth, requireTelegramAuth } from '../lib/auth.js';
import { buildState } from '../services/state.js';

export const stateRoutes: FastifyPluginAsync = async (app) => {
  app.get('/state', { preHandler: requireTelegramAuth }, async (request) => {
    const auth = getAuth(request);
    return buildState(auth.userId);
  });
};
