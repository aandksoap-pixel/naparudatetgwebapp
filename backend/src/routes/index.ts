/**
 * Регистрация всех маршрутов backend:
 *   /api/*        — приватные (X-Telegram-Init-Data) + health
 *   /webhook/*    — публичные, без rate limit
 */
import type { FastifyInstance } from 'fastify';
import { supabaseAdmin } from '../lib/supabase.js';
import type { HealthResponse } from '../types.js';
import { contentRoutes } from './content.js';
import { cronRoutes } from './cron.js';
import { matchRoutes } from './matches.js';
import { moodRoutes } from './mood.js';
import { pairRoutes } from './pair.js';
import { profileRoutes } from './profile.js';
import { reminderRoutes } from './reminders.js';
import { sessionRoutes } from './session.js';
import { stateRoutes } from './state.js';
import { subscriptionRoutes } from './subscription.js';
import { swipeRoutes } from './swipes.js';
import { webhookRoutes } from './webhooks.js';

async function checkDatabase(): Promise<boolean> {
  try {
    const { error } = await supabaseAdmin
      .from('users')
      .select('id', { head: true, count: 'exact' })
      .limit(1);
    return error === null;
  } catch {
    return false;
  }
}

export async function registerRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/health', async (): Promise<HealthResponse> => {
    const db = await checkDatabase();
    return {
      ok: true,
      db,
      uptime: Math.round(process.uptime()),
    };
  });

  await app.register(sessionRoutes, { prefix: '/api' });
  await app.register(stateRoutes, { prefix: '/api' });
  await app.register(pairRoutes, { prefix: '/api' });
  await app.register(profileRoutes, { prefix: '/api' });
  await app.register(moodRoutes, { prefix: '/api' });
  await app.register(swipeRoutes, { prefix: '/api' });
  await app.register(matchRoutes, { prefix: '/api' });
  await app.register(reminderRoutes, { prefix: '/api' });
  await app.register(contentRoutes, { prefix: '/api' });
  await app.register(subscriptionRoutes, { prefix: '/api' });
  await app.register(cronRoutes, { prefix: '/api' });

  await app.register(webhookRoutes);
}
