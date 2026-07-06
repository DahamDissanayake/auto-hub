import { Injectable, NotFoundException, Inject } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Not, IsNull } from 'typeorm';
import { Campaign } from './entities/campaign.entity';
import { Contact } from './entities/contact.entity';
import { SendLog } from './entities/send-log.entity';
import { CreateCampaignDto } from './dto/create-campaign.dto';
import { ContactDto } from './dto/add-contacts.dto';

@Injectable()
export class CampaignsService {
  constructor(
    @InjectRepository(Campaign) private campaignRepo: Repository<Campaign>,
    @InjectRepository(Contact) private contactRepo: Repository<Contact>,
    @InjectRepository(SendLog) private logRepo: Repository<SendLog>,
    @Inject('MailQueueService') private mailQueue: any,
  ) {}

  async findAll() {
    const campaigns = await this.campaignRepo.find({ order: { createdAt: 'DESC' } });
    return Promise.all(campaigns.map(c => this.withStats(c)));
  }

  async findOne(id: number): Promise<Campaign> {
    const c = await this.campaignRepo.findOneBy({ id });
    if (!c) throw new NotFoundException(`Campaign ${id} not found`);
    return c;
  }

  async create(dto: CreateCampaignDto): Promise<Campaign> {
    const campaign = this.campaignRepo.create({
      ...dto,
      scheduledAt: dto.scheduledAt ? new Date(dto.scheduledAt) : null,
    });
    return this.campaignRepo.save(campaign);
  }

  async addContacts(campaignId: number, contacts: ContactDto[]) {
    const rows = contacts.map(c => this.contactRepo.create({ ...c, campaignId }));
    return this.contactRepo.save(rows);
  }

  async launch(id: number) {
    const campaign = await this.findOne(id);
    const contacts = await this.contactRepo.findBy({ campaignId: id });
    const logs = contacts.map(c =>
      this.logRepo.create({ campaignId: id, contactId: c.id, status: 'pending' })
    );
    await this.logRepo.save(logs);
    const newStatus = campaign.scheduledAt ? 'scheduled' : 'sending';
    await this.campaignRepo.update(id, { status: newStatus });
    this.mailQueue.enqueue({ ...campaign, status: newStatus });
    return { queued: logs.length };
  }

  async pause(id: number) {
    await this.campaignRepo.update(id, { status: 'paused' });
    this.mailQueue.pause(id);
  }

  async resume(id: number) {
    await this.campaignRepo.update(id, { status: 'sending' });
    const campaign = await this.findOne(id);
    this.mailQueue.enqueue(campaign);
  }

  async retryFailed(id: number) {
    await this.logRepo.update(
      { campaignId: id, status: 'failed' as any },
      { status: 'pending', error: null, sentAt: null },
    );
    const campaign = await this.findOne(id);
    await this.campaignRepo.update(id, { status: 'sending' });
    this.mailQueue.enqueue(campaign);
  }

  async remove(id: number): Promise<void> {
    const campaign = await this.findOne(id);
    this.mailQueue.pause(id);
    await this.logRepo.delete({ campaignId: id });
    await this.contactRepo.delete({ campaignId: id });
    await this.campaignRepo.remove(campaign);
  }

  async getLogs(campaignId: number): Promise<SendLog[]> {
    return this.logRepo.find({
      where: { campaignId },
      relations: ['contact'],
      order: { id: 'ASC' },
    });
  }

  private async withStats(campaign: Campaign) {
    const total = await this.logRepo.count({ where: { campaignId: campaign.id } });
    const sent = await this.logRepo.count({ where: { campaignId: campaign.id, status: 'sent' as any } });
    const failed = await this.logRepo.count({ where: { campaignId: campaign.id, status: 'failed' as any } });
    const opened = await this.logRepo.count({ where: { campaignId: campaign.id, openedAt: Not(IsNull()) } });
    const replied = await this.logRepo.count({ where: { campaignId: campaign.id, repliedAt: Not(IsNull()) } });
    return { ...campaign, stats: { total, sent, failed, opened, replied } };
  }
}
