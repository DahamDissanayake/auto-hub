import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import { Campaign } from '../campaigns/entities/campaign.entity';
import { Contact } from '../campaigns/entities/contact.entity';
import { SendLog } from '../campaigns/entities/send-log.entity';
import { AccountsService } from '../accounts/accounts.service';

@Injectable()
export class MailQueueService implements OnModuleInit {
  private readonly logger = new Logger(MailQueueService.name);
  private paused = new Set<number>();
  private running = new Set<number>();

  constructor(
    @InjectRepository(Campaign) private campaignRepo: Repository<Campaign>,
    @InjectRepository(Contact) private contactRepo: Repository<Contact>,
    @InjectRepository(SendLog) private logRepo: Repository<SendLog>,
    private accountsService: AccountsService,
    private config: ConfigService,
  ) {}

  async onModuleInit() {
    const resumable = await this.campaignRepo?.find({ where: { status: 'sending' } }) ?? [];
    for (const campaign of resumable) {
      this.processCampaign(campaign);
    }
  }

  enqueue(campaign: Campaign) {
    if (campaign.scheduledAt && new Date(campaign.scheduledAt) > new Date()) {
      const delay = new Date(campaign.scheduledAt).getTime() - Date.now();
      setTimeout(() => this.processCampaign(campaign), delay);
    } else {
      this.processCampaign(campaign);
    }
  }

  pause(campaignId: number) {
    this.paused.add(campaignId);
  }

  replaceMergeTags(template: string, contact: Contact): string {
    return template
      .replace(/\{\{firstName\}\}/g, contact.firstName ?? '')
      .replace(/\{\{lastName\}\}/g, contact.lastName ?? '')
      .replace(/\{\{email\}\}/g, contact.email ?? '')
      .replace(/\{\{company\}\}/g, contact.company ?? '');
  }

  injectPixel(html: string, logId: number, domain: string): string {
    const pixel = `<img src="https://${domain}/mails-api/track/open/${logId}.gif" width="1" height="1" style="display:none" alt="">`;
    return html.includes('</body>')
      ? html.replace('</body>', `${pixel}</body>`)
      : html + pixel;
  }

  // Extract base64 data-URI images from HTML, replace with CID references,
  // and return the cleaned HTML + nodemailer inline attachments.
  extractInlineImages(html: string): {
    html: string;
    attachments: Array<{ cid: string; content: Buffer; contentType: string }>;
  } {
    const attachments: ReturnType<typeof this.extractInlineImages>['attachments'] = [];
    let idx = 0;

    const processed = html.replace(
      /src=["']data:([^;]+);base64,([A-Za-z0-9+/=\s]+)["']/g,
      (_match, mimeType: string, b64: string) => {
        const clean = mimeType.trim();
        const ext = clean.split('/')[1]?.replace('jpeg', 'jpg') ?? 'png';
        const cid = `inline-img-${idx++}@mails`;
        attachments.push({
          cid,
          // No filename — a filename causes Gmail to list the image in the
          // attachments panel even when Content-Disposition is inline.
          content: Buffer.from(b64.replace(/\s/g, ''), 'base64'),
          contentType: clean,
          // Let nodemailer handle Content-Disposition via the cid field;
          // setting it explicitly along with a filename triggers the Gmail bug.
        });
        return `src="cid:${cid}"`;
      },
    );

    return { html: processed, attachments };
  }

  private async processCampaign(campaign: Campaign) {
    if (this.running.has(campaign.id)) return;
    this.running.add(campaign.id);
    this.paused.delete(campaign.id);

    const domain = this.config?.get<string>('DOMAIN') ?? 'localhost';
    const account = await this.accountsService.getDecrypted(campaign.fromAccountId);
    const transporter = nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 587,
      secure: false,
      auth: { user: account.smtpUser || account.email, pass: account.appPassword },
    });

    const delayMs = campaign.ratePerHour
      ? Math.ceil(3_600_000 / campaign.ratePerHour)
      : 1500;

    while (true) {
      if (this.paused.has(campaign.id)) {
        this.running.delete(campaign.id);
        return;
      }

      const log = await this.logRepo.findOne({
        where: { campaignId: campaign.id, status: 'pending' },
        relations: ['contact'],
      });

      if (!log) {
        await this.campaignRepo.update(campaign.id, { status: 'completed' });
        this.running.delete(campaign.id);
        return;
      }

      const contact = log.contact;
      const subject = this.replaceMergeTags(campaign.subject, contact);
      const bodyWithSignature = account.signature
        ? `${campaign.bodyHtml}<br><br><div class="signature">${account.signature}</div>`
        : campaign.bodyHtml;
      const body = this.injectPixel(
        this.replaceMergeTags(bodyWithSignature, contact),
        log.id,
        domain,
      );

      try {
        const { html: finalHtml, attachments } = this.extractInlineImages(body);
        const info = await transporter.sendMail({
          from: `"${account.displayName}" <${account.email}>`,
          to: contact.email,
          subject,
          html: finalHtml,
          attachments,
        });
        await this.logRepo.update(log.id, {
          status: 'sent',
          sentAt: new Date(),
          messageId: info.messageId,
        });
      } catch (err: any) {
        this.logger.error(`Failed to send to ${contact.email}: ${err.message}`);
        await this.logRepo.update(log.id, {
          status: 'failed',
          error: err.message ?? String(err),
        });
      }

      await new Promise(r => setTimeout(r, delayMs));
    }
  }
}
