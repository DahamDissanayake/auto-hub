import { Test } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { CampaignsService } from './campaigns.service';
import { Campaign } from './entities/campaign.entity';
import { Contact } from './entities/contact.entity';
import { SendLog } from './entities/send-log.entity';
import { GmailAccount } from '../accounts/entities/gmail-account.entity';

const mockMailQueue = { enqueue: jest.fn(), pause: jest.fn() };

describe('CampaignsService', () => {
  let service: CampaignsService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        TypeOrmModule.forRoot({
          type: 'better-sqlite3',
          database: ':memory:',
          entities: [Campaign, Contact, SendLog, GmailAccount],
          synchronize: true,
        }),
        TypeOrmModule.forFeature([Campaign, Contact, SendLog]),
      ],
      providers: [
        CampaignsService,
        { provide: 'MailQueueService', useValue: mockMailQueue },
      ],
    }).compile();
    service = module.get(CampaignsService);
  });

  async function makeCampaign() {
    return service.create({
      name: 'Test', fromAccountId: 1,
      subject: 'Hello {{firstName}}', bodyHtml: '<p>Hi {{firstName}}</p>',
    });
  }

  it('creates a campaign with status draft', async () => {
    const c = await makeCampaign();
    expect(c.id).toBeDefined();
    expect(c.status).toBe('draft');
  });

  it('addContacts inserts rows linked to campaign', async () => {
    const c = await makeCampaign();
    await service.addContacts(c.id, [
      { firstName: 'John', lastName: 'Doe', email: 'j@acme.com', company: 'Acme' },
    ]);
    const logs_before = await service.getLogs(c.id);
    expect(logs_before).toHaveLength(0);
  });

  it('launch creates send_logs for each contact and sets status', async () => {
    const c = await makeCampaign();
    await service.addContacts(c.id, [
      { email: 'a@x.com' }, { email: 'b@x.com' },
    ]);
    const result = await service.launch(c.id);
    expect(result.queued).toBe(2);
    expect(mockMailQueue.enqueue).toHaveBeenCalledTimes(1);
    const logs = await service.getLogs(c.id);
    expect(logs).toHaveLength(2);
    expect(logs.every(l => l.status === 'pending')).toBe(true);
  });

  it('pause sets status to paused and calls mailQueue.pause', async () => {
    const c = await makeCampaign();
    await service.pause(c.id);
    expect(mockMailQueue.pause).toHaveBeenCalledWith(c.id);
  });
});
