import { Body, Controller, Post, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import { Req } from '@nestjs/common';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { verifyLicense } from '@zhicang/shared';
import type { LicensePayload, SyncPushItem } from '@zhicang/shared';
import { SyncService } from './sync.service';

function loadPublicKey(): string {
  if (process.env.LICENSE_PUBLIC_KEY) return process.env.LICENSE_PUBLIC_KEY.replace(/\\n/g, '\n');
  const candidates = [
    process.env.LICENSE_PUBLIC_KEY_PATH,
    join(process.cwd(), 'keys', 'license_public.pem'),
    join(process.cwd(), '..', '..', 'keys', 'license_public.pem'),
  ].filter(Boolean) as string[];
  for (const p of candidates) if (existsSync(p)) return readFileSync(p, 'utf8');
  throw new Error('找不到许可证公钥');
}

@Controller('sync')
export class SyncController {
  private readonly publicKey = loadPublicKey();

  constructor(private readonly sync: SyncService) {}

  // 用桌面端的许可证 JWT 鉴权；sub 即用户邮箱，作为同步命名空间
  private auth(req: Request): string {
    const header = req.headers['authorization'];
    if (!header || Array.isArray(header)) throw new UnauthorizedException('缺少授权');
    const [type, token] = header.split(' ');
    if (type !== 'Bearer' || !token) throw new UnauthorizedException('授权格式错误');
    const payload = verifyLicense(token, this.publicKey) as LicensePayload | null;
    if (!payload?.sub) throw new UnauthorizedException('许可证无效或已过期');
    return payload.sub;
  }

  @Post()
  async run(
    @Req() req: Request,
    @Body() body: { since?: number; items?: SyncPushItem[] },
  ): Promise<{ items: SyncPushItem[]; serverTime: number }> {
    const email = this.auth(req);
    return this.sync.sync(email, body.since ?? 0, body.items ?? []);
  }
}
