import { Body, Controller, Get, Logger, Param, Post, Query, Req, Res } from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import { SkipThrottle, Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { IsEmail, IsString } from 'class-validator';
import { PaymentService } from './payment.service';

class CheckoutDto {
  @IsString() productId!: string;
  @IsEmail() email!: string;
}

@Controller('payment')
export class PaymentController {
  private readonly logger = new Logger(PaymentController.name);
  constructor(private readonly payment: PaymentService) {}

  private rawBodyOf(req: RawBodyRequest<Request>): Buffer {
    return req.rawBody ?? Buffer.from(JSON.stringify(req.body ?? {}));
  }

  // 防刷单：每 IP 每分钟最多 20 次下单
  @Throttle({ default: { ttl: 60_000, limit: 20 } })
  @Post('checkout')
  checkout(@Body() dto: CheckoutDto) {
    return this.payment.createCheckout(dto.productId, dto.email);
  }

  @Get('order/:id')
  order(@Param('id') id: string) {
    return this.payment.getOrderPublic(id);
  }

  // 模拟支付收银台页面
  @Get('mock/pay')
  async mockPay(@Query('orderId') orderId: string, @Res() res: Response) {
    const order = await this.payment.getOrderPublic(orderId);
    const yuan = (order.amountCents / 100).toFixed(2);
    res.type('html').send(`<!doctype html><html lang="zh-CN"><head><meta charset="utf-8">
      <meta name="viewport" content="width=device-width,initial-scale=1">
      <title>模拟收银台</title>
      <style>body{font-family:system-ui,'PingFang SC',sans-serif;background:#f4f5f8;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0}
      .card{background:#fff;padding:32px;border-radius:16px;box-shadow:0 10px 40px rgba(0,0,0,.08);width:360px;text-align:center}
      h1{font-size:18px}.amt{font-size:32px;color:#4f46e5;margin:16px 0}
      button{background:#4f46e5;color:#fff;border:0;padding:12px 24px;border-radius:10px;font-size:16px;cursor:pointer;width:100%}
      .muted{color:#888;font-size:12px;margin-top:12px}</style></head>
      <body><div class="card"><h1>智藏 ZhiCang · 模拟收银台</h1>
      <div class="amt">￥${yuan} ${order.currency}</div>
      <p class="muted">订单号 ${order.id}</p>
      <form method="post" action="/api/payment/mock/confirm"><input type="hidden" name="orderId" value="${order.id}">
      <button type="submit">确认支付（模拟）</button></form>
      <p class="muted">真实环境请在后台切换 Stripe / 支付宝 / 微信支付</p></div></body></html>`);
  }

  @Post('mock/confirm')
  async mockConfirm(@Body('orderId') orderId: string, @Res() res: Response) {
    const r = await this.payment.mockConfirm(orderId);
    const portal = process.env.PORTAL_URL || 'http://localhost:3002';
    res.redirect(`${portal}/result?orderId=${orderId}&code=${encodeURIComponent(r.code)}`);
  }

  // Stripe 异步回调（checkout.session.completed）
  @SkipThrottle()
  @Post('webhook/stripe')
  async stripeWebhook(@Req() req: RawBodyRequest<Request>, @Res() res: Response) {
    try {
      await this.payment.handleWebhook('stripe', this.rawBodyOf(req), req.headers as Record<string, string | undefined>);
      res.json({ received: true });
    } catch (e) {
      this.logger.error(`Stripe webhook 处理失败：${(e as Error).message}`);
      res.status(400).send((e as Error).message);
    }
  }

  // 支付宝异步通知：成功必须回复纯文本 "success"
  @SkipThrottle()
  @Post('webhook/alipay')
  async alipayWebhook(@Req() req: RawBodyRequest<Request>, @Res() res: Response) {
    try {
      await this.payment.handleWebhook('alipay', this.rawBodyOf(req), req.headers as Record<string, string | undefined>);
      res.type('text/plain').send('success');
    } catch (e) {
      this.logger.error(`支付宝 webhook 处理失败：${(e as Error).message}`);
      res.type('text/plain').send('failure');
    }
  }

  // 微信支付 v3 回调：成功回复 {code:"SUCCESS"}
  @SkipThrottle()
  @Post('webhook/wechat')
  async wechatWebhook(@Req() req: RawBodyRequest<Request>, @Res() res: Response) {
    try {
      await this.payment.handleWebhook('wechat', this.rawBodyOf(req), req.headers as Record<string, string | undefined>);
      res.json({ code: 'SUCCESS' });
    } catch (e) {
      this.logger.error(`微信 webhook 处理失败：${(e as Error).message}`);
      res.status(500).json({ code: 'FAIL', message: (e as Error).message });
    }
  }
}
