import { Test } from '@nestjs/testing';
import { TypeOrmModule, getRepositoryToken } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { TrackingController } from './tracking.controller';
import { SendLog } from '../campaigns/entities/send-log.entity';
import { Contact } from '../campaigns/entities/contact.entity';
import { Campaign } from '../campaigns/entities/campaign.entity';
import { GmailAccount } from '../accounts/entities/gmail-account.entity';
import { Repository } from 'typeorm';

describe('TrackingController GET /track/open/:logId.gif', () => {
  let app: INestApplication;
  let logRepo: Repository<SendLog>;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        TypeOrmModule.forRoot({
          type: 'better-sqlite3',
          database: ':memory:',
          entities: [SendLog, Contact, Campaign, GmailAccount],
          synchronize: true,
        }),
        TypeOrmModule.forFeature([SendLog]),
      ],
      controllers: [TrackingController],
    }).compile();

    app = module.createNestApplication();
    await app.init();
    logRepo = module.get(getRepositoryToken(SendLog));
  });

  afterEach(() => app.close());

  it('returns a 1x1 GIF with Content-Type image/gif', async () => {
    await request(app.getHttpServer())
      .get('/track/open/999.gif')
      .expect(200)
      .expect('Content-Type', /image\/gif/);
  });

  it('sets openedAt on a matching pending log', async () => {
    const log = logRepo.create({ campaignId: 1, contactId: 1, status: 'sent' });
    const saved = await logRepo.save(log);

    await request(app.getHttpServer()).get(`/track/open/${saved.id}.gif`).expect(200);

    const updated = await logRepo.findOneBy({ id: saved.id });
    expect(updated.openedAt).not.toBeNull();
  });

  it('does not throw for a non-existent logId', async () => {
    await request(app.getHttpServer()).get('/track/open/99999.gif').expect(200);
  });
});
