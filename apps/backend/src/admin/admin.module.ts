import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TagDict } from '../db/entities';
import { LicenseModule } from '../license/license.module';
import { OrdersModule } from '../orders/orders.module';
import { ProductsModule } from '../products/products.module';
import { AdminService } from './admin.service';
import { AdminController } from './admin.controller';

@Module({
  imports: [TypeOrmModule.forFeature([TagDict]), LicenseModule, OrdersModule, ProductsModule],
  providers: [AdminService],
  controllers: [AdminController],
})
export class AdminModule {}
