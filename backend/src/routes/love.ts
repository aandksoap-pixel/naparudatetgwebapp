/** Отправка тёплого сообщения партнёру. */
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { getAuth, requireTelegramAuth } from '../lib/auth.js';
import { parseInput } from '../lib/validation.js';
import { sendLoveMessage } from '../services/love.js';
import { buildState, toLoveMessageInfo } from '../services/state.js';

const loveSchema = z.object({
  text: z.string().trim().min(1, 'Напишите сообщение').max(300, 'Максимум 300 символов'),
});

export const loveRoutes: FastifyPluginAsync = async (app) => {
  app.post('/love', { preHandler: requireTelegramAuth }, async (request) => {
    const auth = getAuth(request);
    const input = parseInput(loveSchema, request.body);
    const message = await sendLoveMessage(auth.userId, input.text);
    const state = await buildState(auth.userId);
    return { state, message: toLoveMessageInfo(message) };
  });
};
