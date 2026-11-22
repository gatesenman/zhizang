import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { MoreThan, Repository } from 'typeorm';
import type { SyncPushItem } from '@zhicang/shared';
import { SyncItem } from '../db/entities';

@Injectable()
export class SyncService {
  constructor(@InjectRepository(SyncItem) private readonly repo: Repository<SyncItem>) {}

  // 接收客户端推送的本地变更（last-write-wins），返回服务端自 since 以来的变更
  async sync(
    email: string,
    since: number,
    items: SyncPushItem[],
  ): Promise<{ items: SyncPushItem[]; serverTime: number }> {
    for (const it of items) {
      const existing = await this.repo.findOne({ where: { email, urlHash: it.urlHash } });
      if (existing && Number(existing.updatedAtMs) >= it.updatedAt) continue; // 服务端更新，忽略
      if (existing) {
        existing.payload = JSON.stringify(it);
        existing.updatedAtMs = String(it.updatedAt);
        existing.deleted = it.deleted;
        await this.repo.save(existing);
      } else {
        await this.repo.save(
          this.repo.create({
            email,
            urlHash: it.urlHash,
            payload: JSON.stringify(it),
            updatedAtMs: String(it.updatedAt),
            deleted: it.deleted,
          }),
        );
      }
    }

    // 下发服务端自 since 之后的变更（含对端推送的，客户端用 LWW 自行过滤）
    const rows = await this.repo.find({
      where: { email, updatedAtMs: MoreThan(String(since)) },
      order: { updatedAtMs: 'ASC' },
      take: 5000,
    });
    const out: SyncPushItem[] = rows.map((r) => {
      const parsed = JSON.parse(r.payload) as SyncPushItem;
      parsed.updatedAt = Number(r.updatedAtMs);
      parsed.deleted = r.deleted;
      return parsed;
    });
    return { items: out, serverTime: Date.now() };
  }
}
