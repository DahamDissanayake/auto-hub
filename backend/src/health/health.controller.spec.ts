import { Test } from '@nestjs/testing';
import { HealthController } from './health.controller';
import { SettingsService } from '../settings/settings.service';
import { ConfigService } from '@nestjs/config';

describe('HealthController', () => {
  let controller: HealthController;
  const mockSettings = { get: jest.fn() };
  const mockConfig = { get: jest.fn() };

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        { provide: SettingsService, useValue: mockSettings },
        { provide: ConfigService, useValue: mockConfig },
      ],
    }).compile();
    controller = module.get(HealthController);
    jest.clearAllMocks();
  });

  it('returns status ok with full HealthData shape', async () => {
    mockSettings.get.mockResolvedValue('Asia/Colombo');
    mockConfig.get.mockImplementation((key: string) => {
      if (key === 'PLUGIN_DIR') return '/app/plugins';
      if (key === 'TELEGRAM_BOT_TOKEN') return 'tok';
      if (key === 'TELEGRAM_CHAT_ID') return '123';
      if (key === 'N8N_API_KEY') return null;
      return null;
    });
    const result = await controller.getHealth();
    expect(result.status).toBe('ok');
    expect(result.timezone).toBe('Asia/Colombo');
    expect(result.pluginDir).toBe('/app/plugins');
    expect(result.telegramConfigured).toBe(true);
    expect(result.n8nConfigured).toBe(false);
    expect(typeof result.version).toBe('string');
    expect(typeof result.nodeVersion).toBe('string');
  });

  it('falls back to Asia/Colombo when timezone setting is null', async () => {
    mockSettings.get.mockResolvedValue(null);
    mockConfig.get.mockReturnValue(null);
    const result = await controller.getHealth();
    expect(result.timezone).toBe('Asia/Colombo');
  });
});
