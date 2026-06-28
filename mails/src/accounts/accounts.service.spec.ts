import { Test } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AccountsService } from './accounts.service';
import { CryptoService } from '../crypto/crypto.service';
import { CryptoModule } from '../crypto/crypto.module';
import { GmailAccount } from './entities/gmail-account.entity';

describe('AccountsService', () => {
  let service: AccountsService;
  let repo: Repository<GmailAccount>;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        TypeOrmModule.forRoot({
          type: 'better-sqlite3',
          database: ':memory:',
          entities: [GmailAccount],
          synchronize: true,
        }),
        TypeOrmModule.forFeature([GmailAccount]),
        CryptoModule,
      ],
      providers: [AccountsService],
    }).compile();

    service = module.get(AccountsService);
    repo = module.get(getRepositoryToken(GmailAccount));
  });

  it('stores the password encrypted', async () => {
    const created = await service.create({
      email: 'test@gmail.com',
      displayName: 'Test',
      appPassword: 'plain-secret',
    });
    const raw = await repo.findOneBy({ id: created.id });
    expect(raw.appPassword).not.toBe('plain-secret');
    expect(raw.appPassword.length).toBeGreaterThan(20);
  });

  it('masks password in findAll', async () => {
    await service.create({ email: 'a@b.com', displayName: 'A', appPassword: 'secret' });
    const accounts = await service.findAll();
    expect(accounts[0].appPassword).toBe('[hidden]');
  });

  it('returns decrypted password in getDecrypted', async () => {
    const created = await service.create({
      email: 'c@d.com', displayName: 'C', appPassword: 'my-pass',
    });
    const decrypted = await service.getDecrypted(created.id);
    expect(decrypted.appPassword).toBe('my-pass');
  });

  it('setDefault clears all then sets one', async () => {
    const a = await service.create({ email: 'e@f.com', displayName: 'E', appPassword: 'x', isDefault: true });
    const b = await service.create({ email: 'g@h.com', displayName: 'G', appPassword: 'y' });
    await service.setDefault(b.id);
    const all = await repo.find();
    expect(all.find(r => r.id === a.id).isDefault).toBe(false);
    expect(all.find(r => r.id === b.id).isDefault).toBe(true);
  });
});
