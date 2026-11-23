/** Настроение: сохранение и уведомление партнёра. */
import type { FastifyPluginAsync } from 'fastify';
import { getAuth, requireTelegramAuth } from '../lib/auth.js';
import { moodSchema, parseInput } from '../lib/validation.js';
import { setMood } from '../services/mood.js';
import { buildState } from '../services/state.js';

export const moodRoutes: FastifyPluginAsync = async (app) => {
  app.post('/mood', { preHandler: requireTelegramAuth }, async (request) => {
    const auth = getAuth(request);
    const input = parseInput(moodSchema, request.body);
    const result = await setMood(auth.userId, input.moodStatus, input.moodText);
    const state = await buildState(auth.userId);
    return { state, notifiedPartner: result.notifiedPartner };
  });
};
