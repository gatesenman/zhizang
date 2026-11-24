import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { MoreThan, Repository } from 'typeorm';
import type { SyncPushItem, SyncResponse } from '@zhicang/shared';
import { SyncItem } from '../db/entities';

@Injectable()
export class SyncService {
  constructor(@InjectRepository(SyncItem) private readonly repo: Repository<SyncItem>) {}

  private queue: Promise<void> = Promise.resolve();

  // 接收客户端推送的本地变更（last-write-wins），返回服务端自 since 以来的变更
  async sync(
    email: string,
    since: number,
    items: SyncPushItem[],
    options: { protocol?: 2; cursor?: string; pushOnly?: boolean } = {},
  ): Promise<SyncResponse> {
    if (!Number.isFinite(since) || since < 0 || !Array.isArray(items) || items.length > 5000) {
      throw new BadRequestException('同步请求格式无效或超过 5000 条');
    }
    if ((options.protocol !== undefined && options.protocol !== 2)
      || (options.cursor !== undefined && (typeof options.cursor !== 'string' || options.cursor.length > 256))
      || (options.pushOnly !== undefined && typeof options.pushOnly !== 'boolean')) throw new BadRequestException('分页参数无效');
    // Validate the whole batch before writing anything.
    for (const it of items) {
      let validUrl = false;
      try { const u = new URL(it?.url); validUrl = ['http:', 'https:'].includes(u.protocol) && !u.username && !u.password; } catch { /* rejected below */ }
      if (!it || !(validUrl || (options.protocol === 2 && it.deleted === true && it.url === '' && /^[a-f0-9]{40}$/.test(it.urlHash))) || typeof it.urlHash !== 'string' || !it.urlHash || it.urlHash.length > 256
        || typeof it.title !== 'string' || typeof it.description !== 'string' || typeof it.notes !== 'string'
        || it.notes.length > 1_000_000 || !Array.isArray(it.tags) || it.tags.length > 1000 || it.tags.some((t) => typeof t !== 'string')
        || !['active', 'dead', 'archived'].includes(it.status) || !['unread', 'read'].includes(it.readState)
        || typeof it.favorite !== 'boolean' || typeof it.pinned !== 'boolean' || typeof it.deleted !== 'boolean'
        || !Number.isSafeInteger(it.updatedAt) || it.updatedAt < 0) {
        throw new BadRequestException('同步收藏格式无效');
      }
    }
    // Serialize this lightweight service's transactions (also safe for SQL.js's one connection).
    const work = () => this.repo.manager.transaction(async (manager) => {
      const repo = manager.getRepository(SyncItem);
      for (const it of items) {
        const existing = await repo.findOne({ where: { email, urlHash: it.urlHash } });
        if (existing && Number(existing.updatedAtMs) >= it.updatedAt) continue;
        await repo.save(repo.create({ ...(existing ?? {}), email, urlHash: it.urlHash,
          payload: JSON.stringify(it), updatedAtMs: String(it.updatedAt), deleted: it.deleted }));
      }
      if (options.protocol === 2 && options.pushOnly) return { items: [], serverTime: Date.now(), protocol: 2 as const, nextCursor: null };
      // v2 deliberately traverses all keys: client clocks are not safe server change cursors.
      const pageSize = options.protocol === 2 ? 500 : 5000;
      const where = options.protocol === 2
        ? { email, ...(options.cursor ? { urlHash: MoreThan(options.cursor) } : {}) }
        : { email, updatedAtMs: MoreThan(String(since)) };
      const rows = await repo.find({ where, order: options.protocol === 2 ? { urlHash: 'ASC' } : { updatedAtMs: 'ASC' }, take: pageSize + 1 });
      if (options.protocol !== 2 && rows.length > pageSize) throw new BadRequestException('请升级客户端使用分页同步，未推进游标');
      const page = rows.slice(0, pageSize);
      const out = page.map((r) => ({ ...JSON.parse(r.payload), updatedAt: Number(r.updatedAtMs), deleted: r.deleted })) as SyncPushItem[];
      if (options.protocol !== 2 && out.some((it) => it.deleted && !it.url)) throw new BadRequestException('删除墓碑需要新版分页客户端');
      return { items: out, serverTime: Date.now(), ...(options.protocol === 2 ? { protocol: 2 as const,
        nextCursor: rows.length > pageSize ? page[page.length - 1].urlHash : null } : {}) };
    });
    const result = this.queue.then(work, work);
    this.queue = result.then(() => undefined, () => undefined);
    return result;
  }
}
