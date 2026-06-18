import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DashboardService } from './dashboard.service';
import { DashboardController } from './dashboard.controller';
import { Plugin } from '../plugins/entities/plugin.entity';
import { PluginExecution } from '../plugins/entities/plugin-execution.entity';
import { ScheduledJob } from '../scheduler/entities/scheduled-job.entity';
import { N8nModule } from '../n8n/n8n.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Plugin, PluginExecution, ScheduledJob]),
    N8nModule,
  ],
  providers: [DashboardService],
  controllers: [DashboardController],
})
export class DashboardModule {}
