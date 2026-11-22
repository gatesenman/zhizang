import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { customAlphabet } from 'nanoid';
import { signLicense } from '@zhicang/shared';
import { ActivationCode, DeviceBinding } from '../db/entities';

const codeGen = customAlphabet('ABCDEFGHJKMNPQRSTUVWXYZ23456789', 20);

function loadPrivateKey(): string {
  if (process.env.LICENSE_PRIVATE_KEY) return process.env.LICENSE_PRIVATE_KEY.replace(/\\n/g, '\n');
  const candidates = [
    process.env.LICENSE_PRIVATE_KEY_PATH,
    join(process.cwd(), 'keys', 'license_private.pem'),
    join(process.cwd(), '..', '..', 'keys', 'license_private.pem'),
  ].filter(Boolean) as string[];
  for (const p of candidates) if (existsSync(p)) return readFileSync(p, 'utf8');
  throw new Error('找不到许可证私钥，请配置 LICENSE_PRIVATE_KEY 或 LICENSE_PRIVATE_KEY_PATH');
}

@Injectable()
export class LicenseService {
  private readonly logger = new Logger(LicenseService.name);
  private readonly privateKey = loadPrivateKey();

  constructor(
    @InjectRepository(ActivationCode) private readonly codes: Repository<ActivationCode>,
    @InjectRepository(DeviceBinding) private readonly bindings: Repository<DeviceBinding>,
  ) {}

  findCodeById(id: string): Promise<ActivationCode | null> {
    return this.codes.findOne({ where: { id } });
  }

  listCodes(): Promise<ActivationCode[]> {
    return this.codes.find({ order: { createdAt: 'DESC' }, take: 500 });
  }

  async setCodeStatus(id: string, status: ActivationCode['status'], note?: string): Promise<ActivationCode> {
    const code = await this.codes.findOne({ where: { id } });
    if (!code) throw new NotFoundException('激活码不存在');
    code.status = status;
    if (note !== undefined) code.note = note;
    return this.codes.save(code);
  }

  async countDevices(codeId: string): Promise<number> {
    return this.bindings.count({ where: { codeId } });
  }

  formatCode(raw: string): string {
    const s = raw.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
    return s.match(/.{1,5}/g)?.join('-') ?? s;
  }

  async generateCode(input: {
    plan: string;
    durationDays: number;
    maxDevices: number;
    email?: string | null;
    orderId?: string | null;
    note?: string | null;
  }): Promise<ActivationCode> {
    const code = this.formatCode(codeGen());
    const entity = this.codes.create({
      code,
      plan: input.plan,
      durationDays: input.durationDays,
      maxDevices: input.maxDevices,
      email: input.email ?? null,
      orderId: input.orderId ?? null,
      note: input.note ?? null,
      status: 'unused',
    });
    return this.codes.save(entity);
  }

  async activate(email: string, rawCode: string, deviceId: string) {
    const code = this.formatCode(rawCode);
    const record = await this.codes.findOne({ where: { code } });
    if (!record) throw new NotFoundException('激活码不存在');
    if (record.status === 'revoked') throw new BadRequestException('激活码已被吊销');
    if (record.email && record.email.toLowerCase() !== email.toLowerCase()) {
      throw new BadRequestException('该激活码绑定了其它邮箱');
    }

    const bound = await this.bindings.find({ where: { codeId: record.id } });
    const already = bound.find((b) => b.deviceId === deviceId);
    if (!already) {
      if (bound.length >= record.maxDevices) {
        throw new BadRequestException(`激活码设备数已达上限（${record.maxDevices}）`);
      }
      await this.bindings.save(this.bindings.create({ codeId: record.id, deviceId, email }));
    }

    record.status = 'active';
    record.email = email;
    if (!record.activatedAt) record.activatedAt = new Date();
    await this.codes.save(record);

    const expiresInSeconds = record.durationDays * 24 * 3600;
    const expireAt = Date.now() + expiresInSeconds * 1000;
    const token = signLicense(
      { sub: email, deviceId, code: record.code, plan: record.plan },
      this.privateKey,
      expiresInSeconds,
    );
    this.logger.log(`激活成功 code=${record.code} email=${email} device=${deviceId.slice(0, 8)}`);
    return { token, plan: record.plan, expireAt, email };
  }
}
