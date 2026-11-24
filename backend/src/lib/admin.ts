/** Проверка, является ли Telegram-пользователь администратором. */
import { config } from '../config.js';

export function isAdminUser(userId: number): boolean {
  return config.adminTelegramIds.includes(userId);
}
