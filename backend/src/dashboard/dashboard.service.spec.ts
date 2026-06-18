import { Test, TestingModule } from '@nestjs/testing';
import { DashboardService } from './dashboard.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Plugin } from '../plugins/entities/plugin.entity';
import { PluginExecution } from '../plugins/entities/plugin-execution.entity';
import { ScheduledJob } from '../scheduler/entities/scheduled-job.entity';
import { N8nService } from '../n8n/n8n.service';

describe('DashboardService', () => {
  let service: DashboardService;

  const plugins = [
    { id: '1', status: 'active' },
    { id: '2', status: 'inactive' },
    { id: '3', status: 'error' },
  ];
  const schedules = [
    { id: 's1', enabled: true, nextRunAt: new Date() },
    { id: 's2', enabled: false },
  ];

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DashboardService,
        {
          provide: getRepositoryToken(Plugin),
          useValue: { find: jest.fn().mockResolvedValue(plugins) },
        },
        {
          provide: getRepositoryToken(PluginExecution),
          useValue: { find: jest.fn().mockResolvedValue([]) },
        },
        {
          provide: getRepositoryToken(ScheduledJob),
          useValue: { find: jest.fn().mockResolvedValue(schedules) },
        },
        {
          provide: N8nService,
          useValue: { getWorkflows: jest.fn().mockRejectedValue(new Error('not configured')) },
        },
      ],
    }).compile();
    service = module.get<DashboardService>(DashboardService);
  });

  it('aggregates plugin stats correctly', async () => {
    const result = await service.getDashboard();
    expect(result.stats.totalPlugins).toBe(3);
    expect(result.stats.activePlugins).toBe(1);
    expect(result.stats.errorPlugins).toBe(1);
  });

  it('aggregates schedule stats correctly', async () => {
    const result = await service.getDashboard();
    expect(result.stats.activeSchedules).toBe(1);
    expect(result.stats.totalSchedules).toBe(2);
  });

  it('returns empty n8n workflows when n8n unreachable', async () => {
    const result = await service.getDashboard();
    expect(result.stats.n8nWorkflows).toBe(0);
    expect(result.n8nWorkflows).toEqual([]);
  });

  it('getCalendar returns enabled schedules', async () => {
    const result = await service.getCalendar();
    expect(result.schedules).toHaveLength(2);
  });
});
