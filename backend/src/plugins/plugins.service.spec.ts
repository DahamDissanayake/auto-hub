import { Test, TestingModule } from '@nestjs/testing';
import { PluginsService } from './plugins.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Plugin } from './entities/plugin.entity';
import { PluginExecution } from './entities/plugin-execution.entity';
import { ConfigService } from '@nestjs/config';
import { NotificationsService } from '../notifications/notifications.service';
import { NotFoundException } from '@nestjs/common';

describe('PluginsService', () => {
  let service: PluginsService;

  const mockPluginRepo = {
    find: jest.fn(),
    findOne: jest.fn(),
    save: jest.fn(),
    update: jest.fn(),
  };
  const mockExecutionRepo = {
    save: jest.fn(),
    update: jest.fn(),
    find: jest.fn(),
  };
  const mockNotifications = { send: jest.fn().mockResolvedValue(undefined) };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PluginsService,
        { provide: getRepositoryToken(Plugin), useValue: mockPluginRepo },
        { provide: getRepositoryToken(PluginExecution), useValue: mockExecutionRepo },
        {
          provide: ConfigService,
          useValue: { get: jest.fn().mockReturnValue('/tmp/test-plugins') },
        },
        { provide: NotificationsService, useValue: mockNotifications },
      ],
    }).compile();
    service = module.get<PluginsService>(PluginsService);
    jest.clearAllMocks();
  });

  it('findAll returns plugins ordered by createdAt', async () => {
    const plugins = [{ id: '1' }, { id: '2' }];
    mockPluginRepo.find.mockResolvedValueOnce(plugins);
    const result = await service.findAll();
    expect(result).toEqual(plugins);
    expect(mockPluginRepo.find).toHaveBeenCalledWith({ order: { createdAt: 'ASC' } });
  });

  it('findOne throws NotFoundException when plugin does not exist', async () => {
    mockPluginRepo.findOne.mockResolvedValueOnce(null);
    await expect(service.findOne('missing-id')).rejects.toThrow(NotFoundException);
  });

  it('toggle changes status from active to inactive', async () => {
    const plugin = { id: '1', status: 'active', name: 'Test Plugin' };
    mockPluginRepo.findOne.mockResolvedValueOnce(plugin);
    mockPluginRepo.update.mockResolvedValueOnce({});
    const result = await service.toggle('1');
    expect(result.status).toBe('inactive');
    expect(mockPluginRepo.update).toHaveBeenCalledWith('1', { status: 'inactive' });
  });

  it('toggle changes status from inactive to active', async () => {
    const plugin = { id: '1', status: 'inactive', name: 'Test Plugin' };
    mockPluginRepo.findOne.mockResolvedValueOnce(plugin);
    mockPluginRepo.update.mockResolvedValueOnce({});
    const result = await service.toggle('1');
    expect(result.status).toBe('active');
  });

  it('updateConfig persists new config', async () => {
    const plugin = { id: '1', status: 'active', config: {} };
    mockPluginRepo.findOne.mockResolvedValueOnce(plugin);
    mockPluginRepo.update.mockResolvedValueOnce({});
    const result = await service.updateConfig('1', { apiKey: 'abc123' });
    expect(result.config).toEqual({ apiKey: 'abc123' });
    expect(mockPluginRepo.update).toHaveBeenCalledWith('1', { config: { apiKey: 'abc123' } });
  });
});
