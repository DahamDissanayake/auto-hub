import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull, Not } from 'typeorm';
import * as cron from 'node-cron';
import { SendLog } from '../campaigns/entities/send-log.entity';
import { GmailAccount } from '../accounts/entities/gmail-account.entity';
import { AccountsService } from '../accounts/accounts.service';

@Injectable()
export class ImapPollerService implements OnModuleInit {
  private readonly logger = new Logger(ImapPollerService.name);

  constructor(
    @InjectRepository(SendLog) private logRepo: Repository<SendLog>,
    @InjectRepository(GmailAccount) private accountRepo: Repository<GmailAccount>,
    private accountsService: AccountsService,
  ) {}

  onModuleInit() {
    cron.schedule('*/15 * * * *', () => this.pollAll());
  }

  async pollAll() {
    const accounts = await this.accountRepo.find();
    for (const account of accounts) {
      await this.pollAccount(account.id).catch(err =>
        this.logger.error(`IMAP poll failed for ${account.email}: ${err.message}`)
      );
    }
  }

  async pollAccount(accountId: number) {
    const sentLogs = await this.logRepo.find({
      where: { status: 'sent' as any, messageId: Not(IsNull()), repliedAt: IsNull() },
    });
    if (sentLogs.length === 0) return;

    const { ImapFlow } = await import('imapflow');
    const account = await this.accountsService.getDecrypted(accountId);

    const client = new ImapFlow({
      host: 'imap.gmail.com',
      port: 993,
      secure: true,
      auth: { user: account.email, pass: account.appPassword },
      logger: false,
    });

    await client.connect();
    const lock = await client.getMailboxLock('INBOX');

    try {
      const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const uids = await client.search({ since });
      if (!uids || !uids.length) return;

      for await (const msg of client.fetch((uids as number[]).join(','), { envelope: true })) {
        const inReplyTo: string = (msg.envelope as any)?.inReplyTo;
        if (!inReplyTo) continue;
        const match = sentLogs.find(l => l.messageId === inReplyTo);
        if (match) {
          await this.logRepo.update(match.id, { repliedAt: new Date() });
        }
      }
    } finally {
      lock.release();
      await client.logout();
    }
  }
}
