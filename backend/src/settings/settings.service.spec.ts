import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { SettingsService } from './settings.service';
import { AppSetting } from './entities/app-setting.entity';

describe('SettingsService', () => {
  let service: SettingsService;

  const mockRepo = {
    find: jest.fn(),
    findOne: jest.fn(),
    save: jest.fn(),
  };

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        SettingsService,
        { provide: getRepositoryToken(AppSetting), useValue: mockRepo },
      ],
    }).compile();
    service = module.get(SettingsService);
    jest.clearAllMocks();
  });

  it('getAll returns settings as a plain object', async () => {
    mockRepo.find.mockResolvedValue([
      { key: 'timezone', value: 'Asia/Colombo' },
    ]);
    const result = await service.getAll();
    expect(result).toEqual({ timezone: 'Asia/Colombo' });
  });

  it('get returns the value for a key that exists', async () => {
    mockRepo.findOne.mockResolvedValue({ key: 'timezone', value: 'UTC' });
    const result = await service.get('timezone');
    expect(result).toBe('UTC');
  });

  it('get returns null when key does not exist', async () => {
    mockRepo.findOne.mockResolvedValue(null);
    const result = await service.get('missing');
    expect(result).toBeNull();
  });

  it('set saves the key/value pair', async () => {
    mockRepo.save.mockResolvedValue({});
    await service.set('timezone', 'Europe/London');
    expect(mockRepo.save).toHaveBeenCalledWith({ key: 'timezone', value: 'Europe/London' });
  });

  it('onModuleInit seeds Asia/Colombo when timezone key is absent', async () => {
    mockRepo.findOne.mockResolvedValue(null);
    mockRepo.save.mockResolvedValue({});
    await service.onModuleInit();
    expect(mockRepo.save).toHaveBeenCalledWith({ key: 'timezone', value: 'Asia/Colombo' });
  });

  it('onModuleInit does not overwrite existing timezone setting', async () => {
    mockRepo.findOne.mockResolvedValue({ key: 'timezone', value: 'UTC' });
    await service.onModuleInit();
    expect(mockRepo.save).not.toHaveBeenCalled();
  });
});
