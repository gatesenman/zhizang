import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { TypeOrmModule } from '@nestjs/typeorm';
import { buildDbOptions } from './db/data-source';
import { SettingsModule } from './settings/settings.module';
import { AuthModule } from './auth/auth.module';
import { SyncModule } from './sync/sync.module';
import { AppController } from './app.controller';

@Module({
  controllers: [AppController],
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    // 全局限流：默认 60 秒内每 IP 120 次请求（敏感端点用 @Throttle 收紧）
    ThrottlerModule.forRoot([
      { ttl: Number(process.env.THROTTLE_TTL) || 60_000, limit: Number(process.env.THROTTLE_LIMIT) || 120 },
    ]),
    TypeOrmModule.forRoot(buildDbOptions()),
    SettingsModule,
    AuthModule,
    SyncModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
