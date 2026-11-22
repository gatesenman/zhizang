import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SyncItem } from '../db/entities';
import { SyncService } from './sync.service';
import { SyncController } from './sync.controller';

@Module({
  imports: [TypeOrmModule.forFeature([SyncItem])],
  controllers: [SyncController],
  providers: [SyncService],
})
export class SyncModule {}
