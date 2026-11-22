import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { OrdersService } from '../orders/orders.service';
import { ProductsService } from '../products/products.service';
import { LicenseService } from '../license/license.service';
import { EmailService } from '../email/email.service';
import { SettingsService } from '../settings/settings.service';
import { getProvider, type ProviderContext, type WebhookResult } from './providers';

@Injectable()
export class PaymentService {
  private readonly logger = new Logger(PaymentService.name);

  constructor(
    private readonly orders: OrdersService,
    private readonly products: ProductsService,
    private readonly license: LicenseService,
    private readonly email: EmailService,
    private readonly settings: SettingsService,
  ) {}

  private get ctx(): ProviderContext {
    return {
      publicBaseUrl: process.env.PUBLIC_BASE_URL || `http://localhost:${process.env.PORT || 3001}`,
      portalUrl: process.env.PORTAL_URL || 'http://localhost:3002',
      settings: this.settings,
    };
  }

  async createCheckout(productId: string, email: string) {
    const product = await this.products.findById(productId);
    if (!product || !product.active) throw new BadRequestException('商品不存在或已下架');
    const providerName = await this.settings.get('payment.provider', 'mock');
    const order = await this.orders.create({
      productId: product.id,
      email,
      amountCents: product.priceCents,
      currency: product.currency,
      provider: providerName,
      status: 'pending',
    });
    const provider = getProvider(providerName);
    const checkout = await provider.createCheckout(order, product, this.ctx);
    if (checkout.providerRef) await this.orders.setStatus(order.id, 'pending', { providerRef: checkout.providerRef });
    return { orderId: order.id, payUrl: checkout.payUrl, provider: providerName };
  }

  // 支付成功后履约：生成激活码 + 发邮件
  async fulfill(orderId: string): Promise<{ code: string }> {
    const order = await this.orders.get(orderId);
    if (order.status === 'paid' && order.codeId) {
      const existing = await this.license.findCodeById(order.codeId);
      if (existing) return { code: existing.code };
    }
    const product = await this.products.findById(order.productId);
    if (!product) throw new BadRequestException('订单商品缺失');
    const code = await this.license.generateCode({
      plan: product.plan,
      durationDays: product.durationDays,
      maxDevices: product.maxDevices,
      email: order.email,
      orderId: order.id,
      note: `订单 ${order.id}`,
    });
    await this.orders.setStatus(order.id, 'paid', { codeId: code.id });
    await this.email.send({
      to: order.email,
      subject: '【智藏 ZhiCang】你的激活码',
      html: `<p>感谢购买 <b>${product.name}</b>。</p><p>激活码：<b style="font-size:18px">${code.code}</b></p><p>请在桌面客户端输入注册邮箱与此激活码完成激活。</p>`,
    });
    this.logger.log(`订单履约完成 order=${order.id} code=${code.code}`);
    return { code: code.code };
  }

  async mockConfirm(orderId: string): Promise<{ code: string }> {
    const order = await this.orders.get(orderId);
    if (order.provider !== 'mock') throw new BadRequestException('该订单非模拟支付');
    return this.fulfill(orderId);
  }

  // 网关异步回调统一入口：验签 → 支付成功则履约（幂等）
  async handleWebhook(
    providerName: string,
    rawBody: Buffer,
    headers: Record<string, string | undefined>,
  ): Promise<WebhookResult | null> {
    const provider = getProvider(providerName);
    const result = await provider.verifyWebhook({ rawBody, headers }, this.ctx);
    if (result && result.paid) {
      await this.fulfill(result.orderId);
      this.logger.log(`[${providerName}] 回调已履约 order=${result.orderId}`);
    } else if (result) {
      this.logger.log(`[${providerName}] 回调已收到但未支付 order=${result.orderId}`);
    }
    return result;
  }

  async getOrderPublic(orderId: string) {
    const order = await this.orders.get(orderId);
    let code: string | null = null;
    if (order.codeId) {
      const c = await this.license.findCodeById(order.codeId);
      code = c?.code ?? null;
    }
    return { id: order.id, status: order.status, amountCents: order.amountCents, currency: order.currency, code };
  }
}
