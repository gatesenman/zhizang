import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Setting } from '../db/entities';

export const DEFAULT_SETTINGS: Record<string, string> = {
  'site.name': '智藏 ZhiCang',
  'login.allowRegister': 'true',
};

@Injectable()
export class SettingsService implements OnModuleInit {
  constructor(@InjectRepository(Setting) private readonly repo: Repository<Setting>) {}

  async onModuleInit(): Promise<void> {
    for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
      const existing = await this.repo.findOne({ where: { key } });
      if (!existing) await this.repo.save(this.repo.create({ key, value }));
    }
  }

  async get(key: string, fallback = ''): Promise<string> {
    const row = await this.repo.findOne({ where: { key } });
    return row?.value ?? DEFAULT_SETTINGS[key] ?? fallback;
  }

  async getBool(key: string): Promise<boolean> {
    return (await this.get(key)).toLowerCase() === 'true';
  }

  async getAll(): Promise<Record<string, string>> {
    const rows = await this.repo.find();
    const out: Record<string, string> = { ...DEFAULT_SETTINGS };
    for (const r of rows) out[r.key] = r.value;
    return out;
  }

  async setMany(patch: Record<string, string>): Promise<void> {
    for (const [key, value] of Object.entries(patch)) {
      const row = (await this.repo.findOne({ where: { key } })) ?? this.repo.create({ key, value: '' });
      row.value = value ?? '';
      await this.repo.save(row);
    }
  }
}
