import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Campaign } from '../campaigns/entities/campaign.entity';
import { Contact } from '../campaigns/entities/contact.entity';
import { SendLog } from '../campaigns/entities/send-log.entity';
import { AccountsModule } from '../accounts/accounts.module';
import { MailQueueService } from './mail-queue.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Campaign, Contact, SendLog]),
    AccountsModule,
  ],
  providers: [
    MailQueueService,
    { provide: 'MailQueueService', useExisting: MailQueueService },
  ],
  exports: [MailQueueService, 'MailQueueService'],
})
export class MailQueueModule {}
