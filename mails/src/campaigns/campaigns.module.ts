import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Campaign } from './entities/campaign.entity';
import { Contact } from './entities/contact.entity';
import { SendLog } from './entities/send-log.entity';
import { CampaignsService } from './campaigns.service';
import { CampaignsController } from './campaigns.controller';
import { MailQueueModule } from '../mail-queue/mail-queue.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Campaign, Contact, SendLog]),
    MailQueueModule,
  ],
  controllers: [CampaignsController],
  providers: [CampaignsService],
})
export class CampaignsModule {}
