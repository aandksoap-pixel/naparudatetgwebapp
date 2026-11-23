/**
 * Логирование (Pino). Используется и Fastify, и фоновыми задачами/ботом.
 * Секреты и заголовки авторизации вырезаются из логов через redaction.
 */
import pino from 'pino';
import { config } from '../config.js';

const redactPaths = [
  'req.headers.authorization',
  'req.headers["x-telegram-init-data"]',
  'req.headers["x-cron-secret"]',
  'req.headers["x-telegram-bot-api-secret-token"]',
  'authorization',
  'authorizationHeader',
  'initData',
  'botToken',
  'serviceRoleKey',
  'jwtSecret',
  'signingSecret',
];

export const loggerOptions = {
  level: config.logLevel,
  name: 'space-for-two-backend',
  redact: {
    paths: redactPaths,
    censor: '[REDACTED]',
  },
};

export const logger = pino(loggerOptions);
