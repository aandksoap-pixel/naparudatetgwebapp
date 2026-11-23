/** Управление парой: создание, вступление по коду, отвязка. */
import type { FastifyPluginAsync } from 'fastify';
import { getAuth, requireTelegramAuth } from '../lib/auth.js';
import { parseInput, pairJoinSchema } from '../lib/validation.js';
import { createPair, joinPair, leavePair } from '../services/pairs.js';
import { buildState } from '../services/state.js';

export const pairRoutes: FastifyPluginAsync = async (app) => {
  app.post('/pair/create', { preHandler: requireTelegramAuth }, async (request) => {
    const auth = getAuth(request);
    await createPair(auth.userId);
    const state = await buildState(auth.userId);
    return { state };
  });

  app.post('/pair/join', { preHandler: requireTelegramAuth }, async (request) => {
    const auth = getAuth(request);
    const input = parseInput(pairJoinSchema, request.body);
    await joinPair(auth.userId, input.inviteCode);
    const state = await buildState(auth.userId);
    return { state };
  });

  app.post('/pair/leave', { preHandler: requireTelegramAuth }, async (request) => {
    const auth = getAuth(request);
    await leavePair(auth.userId);
    const state = await buildState(auth.userId);
    return { state };
  });
};
