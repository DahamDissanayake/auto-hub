import { Test } from '@nestjs/testing';
import { HttpException, HttpStatus } from '@nestjs/common';
import { PluginsController } from './plugins.controller';
import { PluginsService } from './plugins.service';

describe('PluginsController.run', () => {
  let controller: PluginsController;
  const mockService = {
    findOne: jest.fn(),
    run: jest.fn(),
  };

  beforeEach(async () => {
    process.env.ADMIN_PASSWORD = 'secret123';
    const module = await Test.createTestingModule({
      controllers: [PluginsController],
      providers: [{ provide: PluginsService, useValue: mockService }],
    }).compile();
    controller = module.get(PluginsController);
    jest.clearAllMocks();
  });

  afterEach(() => {
    delete process.env.ADMIN_PASSWORD;
  });

  it('calls run without password check when requiresPassword is false', async () => {
    mockService.findOne.mockResolvedValue({ id: '1', requiresPassword: false });
    mockService.run.mockResolvedValue({ id: 'exec-1', status: 'success' });
    const result = await controller.run('1', {});
    expect(mockService.run).toHaveBeenCalledWith('1', 'manual', undefined);
    expect(result).toEqual({ id: 'exec-1', status: 'success' });
  });

  it('throws 403 when requiresPassword is true and password is missing', async () => {
    mockService.findOne.mockResolvedValue({ id: '1', requiresPassword: true });
    await expect(controller.run('1', {})).rejects.toMatchObject({
      response: { error: 'Invalid password' },
      status: 403,
    });
    expect(mockService.run).not.toHaveBeenCalled();
  });

  it('throws 403 when requiresPassword is true and password is wrong', async () => {
    mockService.findOne.mockResolvedValue({ id: '1', requiresPassword: true });
    await expect(controller.run('1', { password: 'wrong' })).rejects.toMatchObject({
      response: { error: 'Invalid password' },
      status: 403,
    });
  });

  it('calls run when requiresPassword is true and correct password provided', async () => {
    mockService.findOne.mockResolvedValue({ id: '1', requiresPassword: true });
    mockService.run.mockResolvedValue({ id: 'exec-1', status: 'success' });
    const result = await controller.run('1', { action: 'reboot', password: 'secret123' });
    expect(mockService.run).toHaveBeenCalledWith('1', 'manual', 'reboot');
    expect(result).toEqual({ id: 'exec-1', status: 'success' });
  });
});
