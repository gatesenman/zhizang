import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TagDict } from '../db/entities';

@Injectable()
export class AdminService {
  constructor(@InjectRepository(TagDict) private readonly tags: Repository<TagDict>) {}

  listTags(): Promise<TagDict[]> {
    return this.tags.find({ order: { createdAt: 'DESC' } });
  }

  async addTag(name: string, group?: string): Promise<TagDict> {
    const existing = await this.tags.findOne({ where: { name } });
    if (existing) return existing;
    return this.tags.save(this.tags.create({ name, group: group ?? null }));
  }

  async removeTag(id: string): Promise<void> {
    await this.tags.delete(id);
  }
}
