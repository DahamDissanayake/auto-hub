import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { PluginsService } from '../../plugins/plugins.service';

@Processor('plugin-jobs')
export class PluginJobProcessor extends WorkerHost {
  private readonly logger = new Logger(PluginJobProcessor.name);

  constructor(private pluginsService: PluginsService) {
    super();
  }

  async process(job: Job<{ pluginId: string }>) {
    this.logger.log(`Running scheduled plugin: ${job.data.pluginId}`);
    await this.pluginsService.run(job.data.pluginId, 'scheduled');
  }
}
