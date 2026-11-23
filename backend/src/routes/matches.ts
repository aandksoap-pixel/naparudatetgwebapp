/** Мэтчи: отметка «выполнено» / «вернуть». */
import type { FastifyPluginAsync } from 'fastify';
import { getAuth, requireTelegramAuth } from '../lib/auth.js';
import { idParamSchema, matchUpdateSchema, parseInput } from '../lib/validation.js';
import { buildState } from '../services/state.js';
import { completeMatch } from '../services/swipes.js';

export const matchRoutes: FastifyPluginAsync = async (app) => {
  app.patch('/matches/:id', { preHandler: requireTelegramAuth }, async (request) => {
    const auth = getAuth(request);
    const params = parseInput(idParamSchema, request.params);
    const input = parseInput(matchUpdateSchema, request.body);
    await completeMatch(auth.userId, params.id, input.isCompleted);
    const state = await buildState(auth.userId);
    return { state };
  });
};
