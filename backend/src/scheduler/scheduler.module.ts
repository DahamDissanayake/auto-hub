import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { SchedulerService } from './scheduler.service';
import { SchedulerController } from './scheduler.controller';
import { ScheduledJob } from './entities/scheduled-job.entity';
import { PluginJobProcessor } from './processors/plugin-job.processor';
import { PluginsModule } from '../plugins/plugins.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([ScheduledJob]),
    BullModule.registerQueue({ name: 'plugin-jobs' }),
    PluginsModule,
  ],
  providers: [SchedulerService, PluginJobProcessor],
  controllers: [SchedulerController],
  exports: [SchedulerService],
})
export class SchedulerModule {}
