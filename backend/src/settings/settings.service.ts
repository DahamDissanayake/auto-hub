import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AppSetting } from './entities/app-setting.entity';

@Injectable()
export class SettingsService implements OnModuleInit {
  constructor(
    @InjectRepository(AppSetting)
    private readonly settingRepo: Repository<AppSetting>,
  ) {}

  async onModuleInit() {
    const existing = await this.settingRepo.findOne({ where: { key: 'timezone' } });
    if (!existing) {
      await this.settingRepo.save({ key: 'timezone', value: 'Asia/Colombo' });
    }
  }

  async getAll(): Promise<Record<string, string>> {
    const rows = await this.settingRepo.find();
    return Object.fromEntries(rows.map(r => [r.key, r.value]));
  }

  async get(key: string): Promise<string | null> {
    const row = await this.settingRepo.findOne({ where: { key } });
    return row?.value ?? null;
  }

  async set(key: string, value: string): Promise<void> {
    await this.settingRepo.save({ key, value });
  }
}
