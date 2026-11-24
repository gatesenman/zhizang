import { BadRequestException, Body, Controller, Post, UseGuards } from '@nestjs/common';
import type { SyncPushItem, SyncResponse } from '@zhicang/shared';
import { CurrentUser, JwtAuthGuard } from '../auth/guards';
import type { User } from '../db/entities';
import { SyncService } from './sync.service';

// Authentication protects private data; it is not a paid entitlement.
@Controller('sync')
@UseGuards(JwtAuthGuard)
export class SyncController {
  constructor(private readonly sync: SyncService) {}

  @Post()
  async run(
    @CurrentUser() user: User,
    @Body() body: { since?: number; items?: SyncPushItem[]; protocol?: 2; cursor?: string; pushOnly?: boolean },
  ): Promise<SyncResponse> {
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new BadRequestException('同步请求格式无效');
    return this.sync.sync(`account:${user.id}`,  body.since ?? 0, body.items ?? [], { protocol: body.protocol, cursor: body.cursor, pushOnly: body.pushOnly });
  }
}
