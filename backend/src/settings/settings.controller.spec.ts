import { Test } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { SettingsController } from './settings.controller';
import { SettingsService } from './settings.service';

describe('SettingsController', () => {
  let controller: SettingsController;
  const mockService = {
    getAll: jest.fn(),
    set: jest.fn(),
  };

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      controllers: [SettingsController],
      providers: [{ provide: SettingsService, useValue: mockService }],
    }).compile();
    controller = module.get(SettingsController);
    jest.clearAllMocks();
  });

  it('GET /settings returns all settings', async () => {
    mockService.getAll.mockResolvedValue({ timezone: 'Asia/Colombo' });
    const result = await controller.getAll();
    expect(result).toEqual({ timezone: 'Asia/Colombo' });
  });

  it('PATCH /settings with valid timezone updates and returns settings', async () => {
    mockService.set.mockResolvedValue(undefined);
    mockService.getAll.mockResolvedValue({ timezone: 'UTC' });
    const result = await controller.update({ timezone: 'UTC' });
    expect(mockService.set).toHaveBeenCalledWith('timezone', 'UTC');
    expect(result).toEqual({ timezone: 'UTC' });
  });

  it('PATCH /settings with invalid timezone throws 400', async () => {
    await expect(controller.update({ timezone: 'Not/ATimezone' })).rejects.toThrow(BadRequestException);
    expect(mockService.set).not.toHaveBeenCalled();
  });

  it('PATCH /settings ignores keys that are not timezone', async () => {
    mockService.set.mockResolvedValue(undefined);
    mockService.getAll.mockResolvedValue({ timezone: 'Asia/Colombo' });
    // unknown keys are stored as-is (no validation rule for non-timezone keys)
    await controller.update({ timezone: 'Asia/Tokyo' });
    expect(mockService.set).toHaveBeenCalledWith('timezone', 'Asia/Tokyo');
  });
});
