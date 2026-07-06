import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { GmailAccount } from './entities/gmail-account.entity';
import { CryptoService } from '../crypto/crypto.service';
import { CreateAccountDto } from './dto/create-account.dto';
import { UpdateAccountDto } from './dto/update-account.dto';

@Injectable()
export class AccountsService {
  constructor(
    @InjectRepository(GmailAccount) private repo: Repository<GmailAccount>,
    private crypto: CryptoService,
  ) {}

  async findAll(): Promise<GmailAccount[]> {
    const accounts = await this.repo.find({ order: { createdAt: 'ASC' } });
    return accounts.map(a => ({ ...a, appPassword: '[hidden]' }));
  }

  async create(dto: CreateAccountDto): Promise<GmailAccount> {
    const account = this.repo.create({
      ...dto,
      appPassword: this.crypto.encrypt(dto.appPassword.replace(/\s/g, '')),
      smtpUser: dto.smtpUser?.trim() || null,
    });
    return this.repo.save(account);
  }

  async setDefault(id: number): Promise<void> {
    await this.repo.createQueryBuilder()
      .update(GmailAccount)
      .set({ isDefault: false })
      .execute();
    await this.repo.update(id, { isDefault: true });
  }

  async update(id: number, dto: UpdateAccountDto): Promise<GmailAccount> {
    const account = await this.repo.findOneBy({ id });
    if (!account) throw new NotFoundException(`Account ${id} not found`);
    const patch: Partial<GmailAccount> = {};
    if (dto.displayName !== undefined) patch.displayName = dto.displayName;
    if (dto.email !== undefined) patch.email = dto.email;
    if (dto.appPassword !== undefined) patch.appPassword = this.crypto.encrypt(dto.appPassword.replace(/\s/g, ''));
    if (dto.smtpUser !== undefined) patch.smtpUser = dto.smtpUser?.trim() || null;
    if (dto.signature !== undefined) patch.signature = dto.signature || null;
    if (dto.isDefault !== undefined) patch.isDefault = dto.isDefault;
    await this.repo.update(id, patch);
    return this.repo.findOneBy({ id });
  }

  async remove(id: number): Promise<void> {
    const account = await this.repo.findOneBy({ id });
    if (!account) throw new NotFoundException(`Account ${id} not found`);
    await this.repo.remove(account);
  }

  async getDecrypted(id: number): Promise<GmailAccount> {
    const account = await this.repo.findOneBy({ id });
    if (!account) throw new NotFoundException(`Account ${id} not found`);
    return { ...account, appPassword: this.crypto.decrypt(account.appPassword) };
  }
}
