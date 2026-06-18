import { Controller, Get } from '@nestjs/common';
import { Public } from '../auth/decorators/public.decorator';

@Controller('health')
export class HealthController {
  @Get()
  @Public()
  getHealth() {
    return {
      status: 'ok',
      version: '1.0.0',
      nodeVersion: process.version,
      timezone: process.env.TIMEZONE ?? 'UTC',
      pluginDir: process.env.PLUGIN_DIR ?? '/app/plugins',
      telegramConfigured: !!(process.env.TELEGRAM_BOT_TOKEN),
      n8nConfigured: !!(process.env.N8N_API_KEY),
    };
  }
}
