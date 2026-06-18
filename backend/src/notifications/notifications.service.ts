import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);
  private bot: any = null;
  private chatId: string;

  constructor(private config: ConfigService) {
    const token = config.get<string>('TELEGRAM_BOT_TOKEN');
    this.chatId = config.get<string>('TELEGRAM_CHAT_ID') ?? '';
    if (token) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const TelegramBot = require('node-telegram-bot-api');
        this.bot = new TelegramBot(token);
      } catch (err) {
        this.logger.error(`Failed to init Telegram bot: ${err.message}`);
      }
    }
  }

  async send(message: string): Promise<void> {
    if (!this.bot || !this.chatId) return;
    try {
      await this.bot.sendMessage(this.chatId, message, { parse_mode: 'HTML' });
    } catch (err) {
      this.logger.error(`Telegram send failed: ${err.message}`);
    }
  }
}
