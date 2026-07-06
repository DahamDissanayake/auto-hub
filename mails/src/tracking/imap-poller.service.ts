import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull, Not } from 'typeorm';
import * as cron from 'node-cron';
import { SendLog } from '../campaigns/entities/send-log.entity';
import { GmailAccount } from '../accounts/entities/gmail-account.entity';
import { AccountsService } from '../accounts/accounts.service';

// Strip angle brackets so <foo@bar> and foo@bar both compare equal.
function normId(id: string): string {
  return (id ?? '').replace(/^\s*<|>\s*$/g, '').trim();
}

@Injectable()
export class ImapPollerService implements OnModuleInit {
  private readonly logger = new Logger(ImapPollerService.name);

  constructor(
    @InjectRepository(SendLog) private logRepo: Repository<SendLog>,
    @InjectRepository(GmailAccount) private accountRepo: Repository<GmailAccount>,
    private accountsService: AccountsService,
  ) {}

  onModuleInit() {
    cron.schedule('*/5 * * * *', () => this.pollAll());
  }

  async pollAll() {
    const accounts = await this.accountRepo.find();

    // For alias accounts smtpUser is the real Gmail that owns the inbox.
    // Deduplicate so we only connect once per unique inbox.
    const seen = new Set<string>();
    for (const account of accounts) {
      const imapUser = account.smtpUser?.trim() || account.email;
      if (seen.has(imapUser)) continue;
      seen.add(imapUser);

      await this.pollInbox(account.id, imapUser).catch(err =>
        this.logger.error(`IMAP poll failed for ${imapUser}: ${err.message}`),
      );
    }
  }

  async pollInbox(accountId: number, imapUser: string) {
    // Only check logs that haven't been marked as replied yet.
    const sentLogs = await this.logRepo.find({
      where: { status: 'sent' as any, messageId: Not(IsNull()), repliedAt: IsNull() },
    });
    if (sentLogs.length === 0) return;

    // Build a normalised lookup map: stripped-messageId → log row.
    const byId = new Map<string, SendLog>();
    for (const log of sentLogs) {
      if (log.messageId) byId.set(normId(log.messageId), log);
    }

    const account = await this.accountsService.getDecrypted(accountId);
    const { ImapFlow } = await import('imapflow');

    const client = new ImapFlow({
      host: 'imap.gmail.com',
      port: 993,
      secure: true,
      // Use smtpUser (real Gmail) for IMAP — alias accounts don't have
      // their own IMAP access; replies land in the primary Gmail inbox.
      auth: { user: imapUser, pass: account.appPassword },
      logger: false,
    });

    await client.connect();
    const lock = await client.getMailboxLock('INBOX');

    try {
      const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const seqNums = await client.search({ since });
      const seqArr = Array.isArray(seqNums) ? seqNums : [];
      if (!seqArr.length) return;

      for await (const msg of client.fetch(
        seqArr.join(','),
        {
          envelope: true,
          // Fetch raw headers so we can read References as well as In-Reply-To.
          headers: ['in-reply-to', 'references'],
        },
      )) {
        const envelope = msg.envelope as any;

        // --- check In-Reply-To (primary signal) ---
        const inReplyTo = normId(envelope?.inReplyTo ?? '');
        if (inReplyTo) {
          const match = byId.get(inReplyTo);
          if (match) {
            await this.logRepo.update(match.id, { repliedAt: new Date() });
            byId.delete(inReplyTo); // no need to re-match this log
            continue;
          }
        }

        // --- check References header (fallback: some clients only set this) ---
        const rawHeaders: string = msg.headers
          ? (msg.headers as Buffer).toString()
          : '';
        const refsLine = rawHeaders.match(/^references:\s*(.+(?:\r?\n[ \t].+)*)/im)?.[1] ?? '';
        const refs = refsLine.split(/[\s,]+/).map(normId).filter(Boolean);

        for (const ref of refs) {
          const match = byId.get(ref);
          if (match) {
            await this.logRepo.update(match.id, { repliedAt: new Date() });
            byId.delete(ref);
            break;
          }
        }
      }
    } finally {
      lock.release();
      await client.logout();
    }
  }
}
