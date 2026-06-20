import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { RealIpThrottlerGuard } from './auth/guards/real-ip-throttler.guard';
import { HealthModule } from './health/health.module';
import { AuthModule } from './auth/auth.module';
import { PluginsModule } from './plugins/plugins.module';
import { SchedulerModule } from './scheduler/scheduler.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { N8nModule } from './n8n/n8n.module';
import { NotificationsModule } from './notifications/notifications.module';
import { TerminalModule } from './terminal/terminal.module';
import { SettingsModule } from './settings/settings.module';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';
import { Plugin } from './plugins/entities/plugin.entity';
import { PluginExecution } from './plugins/entities/plugin-execution.entity';
import { ScheduledJob } from './scheduler/entities/scheduled-job.entity';
import { AppSetting } from './settings/entities/app-setting.entity';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ThrottlerModule.forRoot([{
      ttl: 60_000,
      limit: 10,
    }]),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        url: config.get('DATABASE_URL'),
        entities: [Plugin, PluginExecution, ScheduledJob, AppSetting],
        synchronize: false,
      }),
      inject: [ConfigService],
    }),
    BullModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (config: ConfigService) => ({
        connection: { url: config.get<string>('REDIS_URL') ?? 'redis://localhost:6379' },
      }),
      inject: [ConfigService],
    }),
    HealthModule,
    AuthModule,
    PluginsModule,
    SchedulerModule,
    DashboardModule,
    N8nModule,
    NotificationsModule,
    TerminalModule,
    SettingsModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RealIpThrottlerGuard },
  ],
})
export class AppModule {}
