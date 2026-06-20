import { Controller, Get, Patch, Body, BadRequestException } from '@nestjs/common';
import { SettingsService } from './settings.service';

@Controller('settings')
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  @Get()
  getAll(): Promise<Record<string, string>> {
    return this.settingsService.getAll();
  }

  @Patch()
  async update(@Body() body: Record<string, string>): Promise<Record<string, string>> {
    for (const [key, value] of Object.entries(body)) {
      if (key === 'timezone') {
        const EXTRA_VALID = new Set(['UTC', 'GMT']);
        const supported: string[] = (Intl as any).supportedValuesOf?.('timeZone') ?? [];
        if (!EXTRA_VALID.has(value) && !supported.includes(value)) {
          throw new BadRequestException(`Invalid timezone: ${value}`);
        }
      }
      await this.settingsService.set(key, value);
    }
    return this.settingsService.getAll();
  }
}
