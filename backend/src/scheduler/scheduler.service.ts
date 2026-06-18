import { Injectable, OnModuleInit, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { ScheduledJob } from './entities/scheduled-job.entity';

@Injectable()
export class SchedulerService implements OnModuleInit {
  private readonly logger = new Logger(SchedulerService.name);

  constructor(
    @InjectRepository(ScheduledJob)
    private jobRepo: Repository<ScheduledJob>,
    @InjectQueue('plugin-jobs')
    private queue: Queue,
  ) {}

  async onModuleInit() {
    const jobs = await this.jobRepo.find({ where: { enabled: true } });
    for (const job of jobs) {
      await this.addToQueue(job);
    }
    this.logger.log(`Re-registered ${jobs.length} scheduled job(s)`);
  }

  private async addToQueue(job: ScheduledJob) {
    // Remove any existing repeatable job for this schedule (idempotent)
    const existing = await this.queue.getRepeatableJobs();
    for (const rj of existing) {
      if (rj.id === `schedule-${job.id}`) {
        await this.queue.removeRepeatableByKey(rj.key);
      }
    }
    await this.queue.add(
      `plugin-${job.id}`,
      { pluginId: job.pluginId },
      {
        repeat: { pattern: job.cron },
        jobId: `schedule-${job.id}`,
        removeOnComplete: 10,
        removeOnFail: 5,
      },
    );
  }

  async create(pluginId: string, name: string, cron: string): Promise<ScheduledJob> {
    const job = await this.jobRepo.save({ pluginId, name, cron, enabled: true });
    await this.addToQueue(job);
    return job;
  }

  async findAll(): Promise<ScheduledJob[]> {
    return this.jobRepo.find({ order: { createdAt: 'ASC' } });
  }

  async remove(id: string): Promise<void> {
    const job = await this.jobRepo.findOne({ where: { id } });
    if (!job) throw new NotFoundException(`Schedule ${id} not found`);
    const repeatableJobs = await this.queue.getRepeatableJobs();
    for (const rj of repeatableJobs) {
      if (rj.id === `schedule-${id}`) {
        await this.queue.removeRepeatableByKey(rj.key);
      }
    }
    await this.jobRepo.delete(id);
  }

  async toggle(id: string): Promise<ScheduledJob> {
    const job = await this.jobRepo.findOne({ where: { id } });
    if (!job) throw new NotFoundException(`Schedule ${id} not found`);
    const newEnabled = !job.enabled;
    await this.jobRepo.update(id, { enabled: newEnabled });
    if (newEnabled) {
      await this.addToQueue(job);
    } else {
      const repeatableJobs = await this.queue.getRepeatableJobs();
      for (const rj of repeatableJobs) {
        if (rj.id === `schedule-${id}`) {
          await this.queue.removeRepeatableByKey(rj.key);
        }
      }
    }
    return { ...job, enabled: newEnabled };
  }
}
