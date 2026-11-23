/** Профиль: имя пользователя и дата начала отношений. */
import type { FastifyPluginAsync } from 'fastify';
import { getAuth, requireTelegramAuth } from '../lib/auth.js';
import { pairDateSchema, parseInput, profileUpdateSchema } from '../lib/validation.js';
import { setDisplayName, setRelationshipStart } from '../services/pairs.js';
import { buildState } from '../services/state.js';

export const profileRoutes: FastifyPluginAsync = async (app) => {
  app.patch('/profile', { preHandler: requireTelegramAuth }, async (request) => {
    const auth = getAuth(request);
    const input = parseInput(profileUpdateSchema, request.body);
    await setDisplayName(auth.userId, input.displayName);
    const state = await buildState(auth.userId);
    return { state };
  });

  app.patch('/pair/date', { preHandler: requireTelegramAuth }, async (request) => {
    const auth = getAuth(request);
    const input = parseInput(pairDateSchema, request.body);
    await setRelationshipStart(auth.userId, input.relationshipStartDate);
    const state = await buildState(auth.userId);
    return { state };
  });
};
