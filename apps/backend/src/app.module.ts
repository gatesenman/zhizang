import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { TypeOrmModule } from '@nestjs/typeorm';
import { buildDbOptions } from './db/data-source';
import { SettingsModule } from './settings/settings.module';
import { AuthModule } from './auth/auth.module';
import { LicenseModule } from './license/license.module';
import { ProductsModule } from './products/products.module';
import { OrdersModule } from './orders/orders.module';
import { PaymentModule } from './payment/payment.module';
import { EmailModule } from './email/email.module';
import { AdminModule } from './admin/admin.module';
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
    EmailModule,
    AuthModule,
    LicenseModule,
    ProductsModule,
    OrdersModule,
    PaymentModule,
    AdminModule,
    SyncModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
