import { Test, TestingModule } from '@nestjs/testing';
import { Logger } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { ConfigService } from '@nestjs/config';

jest.mock('node-telegram-bot-api', () => {
  return jest.fn().mockImplementation(() => ({
    sendMessage: jest.fn().mockRejectedValue(new Error('Fake Telegram error')),
  }));
});

describe('NotificationsService', () => {
  it('send() is a no-op when TELEGRAM_BOT_TOKEN is not set', async () => {
    const module = await Test.createTestingModule({
      providers: [
        NotificationsService,
        {
          provide: ConfigService,
          useValue: { get: jest.fn().mockReturnValue(undefined) },
        },
      ],
    }).compile();
    const service = module.get<NotificationsService>(NotificationsService);
    await expect(service.send('hello')).resolves.toBeUndefined();
  });

  it('send() does not throw when bot fails', async () => {
    const logSpy = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => {});

    const module = await Test.createTestingModule({
      providers: [
        NotificationsService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockImplementation((key: string) => {
              if (key === 'TELEGRAM_BOT_TOKEN') return 'fake-token';
              if (key === 'TELEGRAM_CHAT_ID') return '12345';
              return undefined;
            }),
          },
        },
      ],
    }).compile();
    const service = module.get<NotificationsService>(NotificationsService);
    // Should not throw even if Telegram API call fails
    await expect(service.send('test')).resolves.not.toThrow();

    logSpy.mockRestore();
  });
});
