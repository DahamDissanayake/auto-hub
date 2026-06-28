import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SendLog } from '../campaigns/entities/send-log.entity';
import { GmailAccount } from '../accounts/entities/gmail-account.entity';
import { TrackingController } from './tracking.controller';
import { ImapPollerService } from './imap-poller.service';
import { AccountsModule } from '../accounts/accounts.module';

@Module({
  imports: [TypeOrmModule.forFeature([SendLog, GmailAccount]), AccountsModule],
  controllers: [TrackingController],
  providers: [ImapPollerService],
})
export class TrackingModule {}
