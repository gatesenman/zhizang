import { Body, Controller, Delete, Get, Param, Patch, Post, Put, UseGuards } from '@nestjs/common';
import { AdminGuard } from '../auth/guards';
import { SettingsService } from '../settings/settings.service';
import { LicenseService } from '../license/license.service';
import { OrdersService } from '../orders/orders.service';
import { ProductsService } from '../products/products.service';
import { AdminService } from './admin.service';
import type { Product } from '../db/entities';

@UseGuards(AdminGuard)
@Controller('admin')
export class AdminController {
  constructor(
    private readonly settings: SettingsService,
    private readonly license: LicenseService,
    private readonly orders: OrdersService,
    private readonly products: ProductsService,
    private readonly admin: AdminService,
  ) {}

  @Get('settings')
  getSettings() {
    return this.settings.getAll();
  }

  @Put('settings')
  async saveSettings(@Body() body: Record<string, string>) {
    await this.settings.setMany(body);
    return this.settings.getAll();
  }

  @Get('codes')
  async listCodes() {
    const codes = await this.license.listCodes();
    return Promise.all(
      codes.map(async (c) => ({ ...c, devices: await this.license.countDevices(c.id) })),
    );
  }

  @Post('codes')
  generateCode(
    @Body() body: { plan?: string; durationDays?: number; maxDevices?: number; count?: number; note?: string },
  ) {
    const count = Math.min(Math.max(body.count ?? 1, 1), 100);
    return Promise.all(
      Array.from({ length: count }).map(() =>
        this.license.generateCode({
          plan: body.plan ?? 'pro',
          durationDays: body.durationDays ?? 365,
          maxDevices: body.maxDevices ?? 1,
          note: body.note ?? null,
        }),
      ),
    );
  }

  @Patch('codes/:id')
  updateCode(@Param('id') id: string, @Body() body: { status?: 'unused' | 'active' | 'revoked'; note?: string }) {
    return this.license.setCodeStatus(id, body.status ?? 'revoked', body.note);
  }

  @Get('orders')
  listOrders() {
    return this.orders.listAll();
  }

  @Get('products')
  listProducts() {
    return this.products.listAll();
  }

  @Post('products')
  upsertProduct(@Body() body: Partial<Product>) {
    return this.products.upsert(body);
  }

  @Delete('products/:id')
  removeProduct(@Param('id') id: string) {
    return this.products.remove(id);
  }

  @Get('tags')
  listTags() {
    return this.admin.listTags();
  }

  @Post('tags')
  addTag(@Body() body: { name: string; group?: string }) {
    return this.admin.addTag(body.name, body.group);
  }

  @Delete('tags/:id')
  removeTag(@Param('id') id: string) {
    return this.admin.removeTag(id);
  }
}
