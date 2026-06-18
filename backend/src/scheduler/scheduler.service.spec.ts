import { Test, TestingModule } from '@nestjs/testing';
import { SchedulerService } from './scheduler.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ScheduledJob } from './entities/scheduled-job.entity';
import { getQueueToken } from '@nestjs/bullmq';
import { NotFoundException } from '@nestjs/common';

describe('SchedulerService', () => {
  let service: SchedulerService;

  const mockQueue = {
    add: jest.fn().mockResolvedValue({}),
    getRepeatableJobs: jest.fn().mockResolvedValue([]),
    removeRepeatableByKey: jest.fn().mockResolvedValue({}),
  };
  const mockRepo = {
    find: jest.fn().mockResolvedValue([]),
    findOne: jest.fn(),
    save: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SchedulerService,
        { provide: getRepositoryToken(ScheduledJob), useValue: mockRepo },
        { provide: getQueueToken('plugin-jobs'), useValue: mockQueue },
      ],
    }).compile();
    service = module.get<SchedulerService>(SchedulerService);
    jest.clearAllMocks();
  });

  it('onModuleInit re-registers all enabled schedules', async () => {
    const jobs = [
      { id: '1', pluginId: 'p1', name: 'test', cron: '0 9 * * *', enabled: true },
    ];
    mockRepo.find.mockResolvedValueOnce(jobs);
    mockQueue.getRepeatableJobs.mockResolvedValue([]);
    await service.onModuleInit();
    expect(mockQueue.add).toHaveBeenCalledTimes(1);
  });

  it('create saves to DB and adds BullMQ job', async () => {
    const saved = { id: 'new-id', pluginId: 'p1', name: 'test', cron: '0 9 * * *', enabled: true };
    mockRepo.save.mockResolvedValueOnce(saved);
    mockQueue.getRepeatableJobs.mockResolvedValue([]);
    const result = await service.create('p1', 'test', '0 9 * * *');
    expect(mockRepo.save).toHaveBeenCalled();
    expect(mockQueue.add).toHaveBeenCalled();
    expect(result.id).toBe('new-id');
  });

  it('remove throws NotFoundException when schedule not found', async () => {
    mockRepo.findOne.mockResolvedValueOnce(null);
    await expect(service.remove('missing-id')).rejects.toThrow(NotFoundException);
  });

  it('toggle disables enabled schedule and removes BullMQ job', async () => {
    const job = { id: '1', pluginId: 'p1', name: 'test', cron: '0 9 * * *', enabled: true };
    mockRepo.findOne.mockResolvedValueOnce(job);
    mockRepo.update.mockResolvedValueOnce({});
    mockQueue.getRepeatableJobs.mockResolvedValueOnce([{ id: 'schedule-1', key: 'key1' }]);
    const result = await service.toggle('1');
    expect(result.enabled).toBe(false);
    expect(mockQueue.removeRepeatableByKey).toHaveBeenCalledWith('key1');
  });

  it('toggle enables disabled schedule and adds BullMQ job', async () => {
    const job = { id: '1', pluginId: 'p1', name: 'test', cron: '0 9 * * *', enabled: false };
    mockRepo.findOne.mockResolvedValueOnce(job);
    mockRepo.update.mockResolvedValueOnce({});
    mockQueue.getRepeatableJobs.mockResolvedValue([]);
    const result = await service.toggle('1');
    expect(result.enabled).toBe(true);
    expect(mockQueue.add).toHaveBeenCalled();
  });
});
