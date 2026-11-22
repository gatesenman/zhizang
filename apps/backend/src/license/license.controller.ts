import { Body, Controller, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { LicenseService } from './license.service';
import { ActivateDto } from './dto';

@Controller('license')
export class LicenseController {
  constructor(private readonly license: LicenseService) {}

  // 防枚举激活码：每 IP 每分钟最多 15 次
  @Throttle({ default: { ttl: 60_000, limit: 15 } })
  @Post('activate')
  activate(@Body() dto: ActivateDto) {
    return this.license.activate(dto.email, dto.code, dto.deviceId);
  }
}
