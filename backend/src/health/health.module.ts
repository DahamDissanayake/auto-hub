import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { SettingsModule } from '../settings/settings.module';

@Module({
  imports: [SettingsModule],
  controllers: [HealthController],
})
export class HealthModule {}
