import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Product } from '../db/entities';

@Injectable()
export class ProductsService implements OnModuleInit {
  constructor(@InjectRepository(Product) private readonly repo: Repository<Product>) {}

  async onModuleInit(): Promise<void> {
    if ((await this.repo.count()) === 0) {
      await this.repo.save([
        this.repo.create({ name: '月度版', plan: 'pro', priceCents: 1800, durationDays: 30, maxDevices: 2, description: '按月订阅，2 台设备', sort: 1 }),
        this.repo.create({ name: '年度版', plan: 'pro', priceCents: 9900, durationDays: 365, maxDevices: 3, description: '最受欢迎，3 台设备', sort: 2 }),
        this.repo.create({ name: '终身版', plan: 'lifetime', priceCents: 29900, durationDays: 36500, maxDevices: 5, description: '一次买断，5 台设备', sort: 3 }),
      ]);
    }
  }

  listActive(): Promise<Product[]> {
    return this.repo.find({ where: { active: true }, order: { sort: 'ASC' } });
  }

  listAll(): Promise<Product[]> {
    return this.repo.find({ order: { sort: 'ASC' } });
  }

  findById(id: string): Promise<Product | null> {
    return this.repo.findOne({ where: { id } });
  }

  async upsert(data: Partial<Product>): Promise<Product> {
    const entity = data.id ? await this.repo.findOne({ where: { id: data.id } }) : null;
    const merged = this.repo.merge(entity ?? this.repo.create(), data);
    return this.repo.save(merged);
  }

  async remove(id: string): Promise<void> {
    await this.repo.delete(id);
  }
}
