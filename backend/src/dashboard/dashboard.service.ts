import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThanOrEqual } from 'typeorm';
import { Plugin } from '../plugins/entities/plugin.entity';
import { PluginExecution } from '../plugins/entities/plugin-execution.entity';
import { ScheduledJob } from '../scheduler/entities/scheduled-job.entity';
import { N8nService } from '../n8n/n8n.service';

@Injectable()
export class DashboardService {
  constructor(
    @InjectRepository(Plugin)
    private pluginRepo: Repository<Plugin>,
    @InjectRepository(PluginExecution)
    private executionRepo: Repository<PluginExecution>,
    @InjectRepository(ScheduledJob)
    private jobRepo: Repository<ScheduledJob>,
    private n8nService: N8nService,
  ) {}

  async getDashboard() {
    const [plugins, schedules, recentActivity] = await Promise.all([
      this.pluginRepo.find(),
      this.jobRepo.find({ order: { nextRunAt: 'ASC' } }),
      this.executionRepo.find({
        order: { startedAt: 'DESC' },
        take: 20,
        relations: ['plugin'],
      }),
    ]);

    const oneDayAgo = new Date(Date.now() - 86_400_000);
    const recentExecs = await this.executionRepo.find({
      where: { startedAt: MoreThanOrEqual(oneDayAgo) },
    });

    let n8nWorkflows: unknown[] = [];
    try {
      const resp = await this.n8nService.getWorkflows();
      n8nWorkflows = resp?.data ?? resp ?? [];
    } catch (_) { /* n8n unreachable or key not set */ }

    return {
      stats: {
        totalPlugins: plugins.length,
        activePlugins: plugins.filter(p => p.status === 'active').length,
        errorPlugins: plugins.filter(p => p.status === 'error').length,
        activeSchedules: schedules.filter(s => s.enabled).length,
        totalSchedules: schedules.length,
        n8nWorkflows: (n8nWorkflows as unknown[]).length,
        recentSuccessRuns: recentExecs.filter(e => e.status === 'success').length,
        recentFailedRuns: recentExecs.filter(e => e.status === 'failed').length,
      },
      recentActivity,
      upcomingSchedules: schedules.filter(s => s.enabled).slice(0, 5),
      n8nWorkflows,
      plugins,
    };
  }

  async getCalendar() {
    const schedules = await this.jobRepo.find({ order: { createdAt: 'ASC' } });
    let n8nWorkflows: unknown[] = [];
    try {
      const resp = await this.n8nService.getWorkflows();
      const all = resp?.data ?? resp ?? [];
      n8nWorkflows = (all as any[]).filter((w) => w.active);
    } catch (_) { /* n8n unreachable */ }
    return { schedules, n8nWorkflows };
  }
}
