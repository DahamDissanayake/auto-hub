import { Controller, Get } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Public } from '../auth/decorators/public.decorator';
import { SettingsService } from '../settings/settings.service';

@Controller('health')
export class HealthController {
  constructor(
    private readonly settingsService: SettingsService,
    private readonly config: ConfigService,
  ) {}

  @Get()
  @Public()
  async getHealth() {
    const timezone = (await this.settingsService.get('timezone')) ?? 'Asia/Colombo';
    return {
      status: 'ok',
      version: process.env.npm_package_version ?? '1.0.0',
      nodeVersion: process.version,
      timezone,
      pluginDir: this.config.get<string>('PLUGIN_DIR') ?? '/app/plugins',
      telegramConfigured: !!(
        this.config.get('TELEGRAM_BOT_TOKEN') && this.config.get('TELEGRAM_CHAT_ID')
      ),
      n8nConfigured: !!this.config.get('N8N_API_KEY'),
    };
  }
}
