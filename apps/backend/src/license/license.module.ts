import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ActivationCode, DeviceBinding } from '../db/entities';
import { LicenseService } from './license.service';
import { LicenseController } from './license.controller';

@Module({
  imports: [TypeOrmModule.forFeature([ActivationCode, DeviceBinding])],
  providers: [LicenseService],
  controllers: [LicenseController],
  exports: [LicenseService],
})
export class LicenseModule {}
