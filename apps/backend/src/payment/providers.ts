import * as crypto from 'node:crypto';
import type { Order, Product } from '../db/entities';
import type { SettingsService } from '../settings/settings.service';

export interface CheckoutResult {
  payUrl: string;
  providerRef?: string;
}

// 网关通知/回调的统一校验结果
export interface WebhookResult {
  orderId: string;
  paid: boolean;
  providerRef?: string;
}

export interface WebhookInput {
  rawBody: Buffer;
  headers: Record<string, string | undefined>;
}

export interface PaymentProvider {
  readonly name: string;
  createCheckout(order: Order, product: Product, ctx: ProviderContext): Promise<CheckoutResult>;
  // 校验网关回调并提取订单与支付状态；非该通道/无法识别时返回 null
  verifyWebhook(input: WebhookInput, ctx: ProviderContext): Promise<WebhookResult | null>;
}

export interface ProviderContext {
  publicBaseUrl: string; // 后端公开地址
  portalUrl: string; // 门户地址
  settings: SettingsService;
}

// ---------------------------------------------------------------------------
// 通用加解密工具
// ---------------------------------------------------------------------------

// 将裸 base64 密钥补全为 PEM；已是 PEM 则原样返回
function normalizePem(key: string, kind: 'PRIVATE' | 'PUBLIC'): string {
  const k = (key || '').trim();
  if (!k) throw new Error('密钥为空');
  if (k.includes('BEGIN')) return k.replace(/\\n/g, '\n');
  const header = kind === 'PRIVATE' ? 'PRIVATE KEY' : 'PUBLIC KEY';
  const body = k.replace(/\s+/g, '').match(/.{1,64}/g)?.join('\n') ?? k;
  return `-----BEGIN ${header}-----\n${body}\n-----END ${header}-----`;
}

function timingSafeEqualHex(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

// AEAD_AES_256_GCM 解密（微信支付 v3 回调资源体）
export function aesGcmDecrypt(key: string, nonce: string, associatedData: string, ciphertextB64: string): string {
  const data = Buffer.from(ciphertextB64, 'base64');
  const authTag = data.subarray(data.length - 16);
  const enc = data.subarray(0, data.length - 16);
  const decipher = crypto.createDecipheriv('aes-256-gcm', Buffer.from(key, 'utf8'), Buffer.from(nonce, 'utf8'));
  decipher.setAuthTag(authTag);
  decipher.setAAD(Buffer.from(associatedData ?? '', 'utf8'));
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8');
}

// ---------------------------------------------------------------------------
// 本地 mock 通道：用于无真实支付凭证时跑通全链路
// ---------------------------------------------------------------------------
export class MockProvider implements PaymentProvider {
  readonly name = 'mock';
  async createCheckout(order: Order, _product: Product, ctx: ProviderContext): Promise<CheckoutResult> {
    return { payUrl: `${ctx.publicBaseUrl}/api/payment/mock/pay?orderId=${order.id}` };
  }

  async verifyWebhook(): Promise<WebhookResult | null> {
    // mock 通道走 /payment/mock/confirm，不接收异步回调
    return null;
  }
}

// ---------------------------------------------------------------------------
// Stripe Checkout Session + Webhook
// ---------------------------------------------------------------------------
export class StripeProvider implements PaymentProvider {
  readonly name = 'stripe';

  async createCheckout(order: Order, product: Product, ctx: ProviderContext): Promise<CheckoutResult> {
    const secret = await ctx.settings.get('payment.stripe.secretKey');
    if (!secret) throw new Error('未配置 Stripe secretKey');
    const body = new URLSearchParams();
    body.set('mode', 'payment');
    body.set('success_url', `${ctx.portalUrl}/result?orderId=${order.id}`);
    body.set('cancel_url', `${ctx.portalUrl}/result?orderId=${order.id}&canceled=1`);
    body.set('client_reference_id', order.id);
    body.set('customer_email', order.email);
    body.set('line_items[0][quantity]', '1');
    body.set('line_items[0][price_data][currency]', product.currency.toLowerCase());
    body.set('line_items[0][price_data][unit_amount]', String(product.priceCents));
    body.set('line_items[0][price_data][product_data][name]', product.name);
    const res = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
    if (!res.ok) throw new Error(`Stripe ${res.status}: ${await res.text()}`);
    const data = (await res.json()) as { id: string; url: string };
    return { payUrl: data.url, providerRef: data.id };
  }

  // 校验 Stripe-Signature（HMAC-SHA256），提取 checkout.session.completed
  async verifyWebhook({ rawBody, headers }: WebhookInput, ctx: ProviderContext): Promise<WebhookResult | null> {
    const secret = await ctx.settings.get('payment.stripe.webhookSecret');
    if (!secret) throw new Error('未配置 Stripe webhookSecret');
    const sigHeader = headers['stripe-signature'];
    if (!sigHeader) throw new Error('缺少 Stripe-Signature');
    const parts: Record<string, string> = {};
    for (const kv of sigHeader.split(',')) {
      const idx = kv.indexOf('=');
      if (idx > 0) parts[kv.slice(0, idx).trim()] = kv.slice(idx + 1).trim();
    }
    const t = parts['t'];
    const v1 = parts['v1'];
    if (!t || !v1) throw new Error('Stripe 签名格式错误');
    if (Math.abs(Date.now() / 1000 - Number(t)) > 300) throw new Error('Stripe 时间戳过期');
    const signed = `${t}.${rawBody.toString('utf8')}`;
    const expected = crypto.createHmac('sha256', secret).update(signed).digest('hex');
    if (!timingSafeEqualHex(expected, v1)) throw new Error('Stripe 签名校验失败');

    const event = JSON.parse(rawBody.toString('utf8')) as {
      type: string;
      data: { object: { id: string; client_reference_id?: string; payment_status?: string; status?: string } };
    };
    if (event.type === 'checkout.session.completed' || event.type === 'checkout.session.async_payment_succeeded') {
      const session = event.data.object;
      const orderId = session.client_reference_id;
      if (!orderId) return null;
      const paid = session.payment_status === 'paid' || session.status === 'complete';
      return { orderId, paid, providerRef: session.id };
    }
    return null;
  }
}

// ---------------------------------------------------------------------------
// 支付宝（电脑网站支付 alipay.trade.page.pay）+ 异步通知验签（RSA2）
// ---------------------------------------------------------------------------
function alipayTimestamp(d: Date): string {
  const p = (n: number): string => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

// 待签名串：按 key 升序，剔除空值；request 时仅剔除 sign，notify 验签时剔除 sign 与 sign_type
function alipaySignContent(params: Record<string, string>, excludeSignType: boolean): string {
  return Object.keys(params)
    .filter((k) => k !== 'sign' && (!excludeSignType || k !== 'sign_type'))
    .filter((k) => params[k] !== '' && params[k] != null)
    .sort()
    .map((k) => `${k}=${params[k]}`)
    .join('&');
}

export class AlipayProvider implements PaymentProvider {
  readonly name = 'alipay';

  async createCheckout(order: Order, product: Product, ctx: ProviderContext): Promise<CheckoutResult> {
    const appId = await ctx.settings.get('payment.alipay.appId');
    const privateKey = await ctx.settings.get('payment.alipay.privateKey');
    if (!appId || !privateKey) throw new Error('未配置支付宝 appId/privateKey');
    const gateway = (await ctx.settings.get('payment.alipay.gateway')) || 'https://openapi.alipay.com/gateway.do';

    const params: Record<string, string> = {
      app_id: appId,
      method: 'alipay.trade.page.pay',
      format: 'JSON',
      charset: 'utf-8',
      sign_type: 'RSA2',
      timestamp: alipayTimestamp(new Date()),
      version: '1.0',
      notify_url: `${ctx.publicBaseUrl}/api/payment/webhook/alipay`,
      return_url: `${ctx.portalUrl}/result?orderId=${order.id}`,
      biz_content: JSON.stringify({
        out_trade_no: order.id,
        total_amount: (order.amountCents / 100).toFixed(2),
        subject: product.name,
        product_code: 'FAST_INSTANT_TRADE_PAY',
      }),
    };
    const content = alipaySignContent(params, false);
    const sign = crypto
      .createSign('RSA-SHA256')
      .update(content, 'utf8')
      .sign(normalizePem(privateKey, 'PRIVATE'), 'base64');
    params.sign = sign;
    const query = Object.keys(params)
      .map((k) => `${k}=${encodeURIComponent(params[k])}`)
      .join('&');
    return { payUrl: `${gateway}?${query}`, providerRef: order.id };
  }

  async verifyWebhook({ rawBody }: WebhookInput, ctx: ProviderContext): Promise<WebhookResult | null> {
    const publicKey = await ctx.settings.get('payment.alipay.publicKey');
    if (!publicKey) throw new Error('未配置支付宝公钥(payment.alipay.publicKey)');
    const params = Object.fromEntries(new URLSearchParams(rawBody.toString('utf8'))) as Record<string, string>;
    const sign = params['sign'];
    if (!sign) throw new Error('支付宝通知缺少 sign');
    const content = alipaySignContent(params, true);
    const ok = crypto
      .createVerify('RSA-SHA256')
      .update(content, 'utf8')
      .verify(normalizePem(publicKey, 'PUBLIC'), sign, 'base64');
    if (!ok) throw new Error('支付宝通知签名校验失败');
    const paid = params['trade_status'] === 'TRADE_SUCCESS' || params['trade_status'] === 'TRADE_FINISHED';
    return { orderId: params['out_trade_no'], paid, providerRef: params['trade_no'] };
  }
}

// ---------------------------------------------------------------------------
// 微信支付 v3（Native 下单）+ 回调验签 + AEAD 解密
// ---------------------------------------------------------------------------
function wechatAuthorization(
  method: string,
  urlPath: string,
  body: string,
  cfg: { mchId: string; serialNo: string; privateKey: string },
): string {
  const ts = Math.floor(Date.now() / 1000).toString();
  const nonce = crypto.randomBytes(16).toString('hex');
  const message = `${method}\n${urlPath}\n${ts}\n${nonce}\n${body}\n`;
  const signature = crypto
    .createSign('RSA-SHA256')
    .update(message, 'utf8')
    .sign(normalizePem(cfg.privateKey, 'PRIVATE'), 'base64');
  return `WECHATPAY2-SHA256-RSA2048 mchid="${cfg.mchId}",nonce_str="${nonce}",signature="${signature}",timestamp="${ts}",serial_no="${cfg.serialNo}"`;
}

export class WechatProvider implements PaymentProvider {
  readonly name = 'wechat';

  async createCheckout(order: Order, product: Product, ctx: ProviderContext): Promise<CheckoutResult> {
    const mchId = await ctx.settings.get('payment.wechat.mchId');
    const appId = await ctx.settings.get('payment.wechat.appId');
    const serialNo = await ctx.settings.get('payment.wechat.serialNo');
    const privateKey = await ctx.settings.get('payment.wechat.privateKey');
    if (!mchId || !appId || !serialNo || !privateKey) {
      throw new Error('未配置微信支付 mchId/appId/serialNo/privateKey');
    }
    const urlPath = '/v3/pay/transactions/native';
    const body = JSON.stringify({
      appid: appId,
      mchid: mchId,
      description: product.name,
      out_trade_no: order.id,
      notify_url: `${ctx.publicBaseUrl}/api/payment/webhook/wechat`,
      amount: { total: order.amountCents, currency: 'CNY' },
    });
    const auth = wechatAuthorization('POST', urlPath, body, { mchId, serialNo, privateKey });
    const res = await fetch(`https://api.mch.weixin.qq.com${urlPath}`, {
      method: 'POST',
      headers: { Authorization: auth, 'Content-Type': 'application/json', Accept: 'application/json' },
      body,
    });
    if (!res.ok) throw new Error(`微信支付 ${res.status}: ${await res.text()}`);
    const data = (await res.json()) as { code_url: string };
    // Native 返回 code_url，由门户渲染为二维码
    return { payUrl: data.code_url, providerRef: order.id };
  }

  async verifyWebhook({ rawBody, headers }: WebhookInput, ctx: ProviderContext): Promise<WebhookResult | null> {
    const apiV3Key = (await ctx.settings.get('payment.wechat.apiV3Key')) || (await ctx.settings.get('payment.wechat.apiKey'));
    if (!apiV3Key) throw new Error('未配置微信 apiV3Key');
    const platformPublicKey = await ctx.settings.get('payment.wechat.platformPublicKey');
    // 配置了平台公钥则校验回调签名（强烈建议生产配置）
    if (platformPublicKey) {
      const ts = headers['wechatpay-timestamp'];
      const nonce = headers['wechatpay-nonce'];
      const signature = headers['wechatpay-signature'];
      if (!ts || !nonce || !signature) throw new Error('微信回调缺少签名头');
      const message = `${ts}\n${nonce}\n${rawBody.toString('utf8')}\n`;
      const ok = crypto
        .createVerify('RSA-SHA256')
        .update(message, 'utf8')
        .verify(normalizePem(platformPublicKey, 'PUBLIC'), signature, 'base64');
      if (!ok) throw new Error('微信回调签名校验失败');
    }
    const json = JSON.parse(rawBody.toString('utf8')) as {
      resource: { ciphertext: string; nonce: string; associated_data: string };
    };
    const plain = aesGcmDecrypt(apiV3Key, json.resource.nonce, json.resource.associated_data, json.resource.ciphertext);
    const data = JSON.parse(plain) as { out_trade_no: string; trade_state: string; transaction_id?: string };
    return { orderId: data.out_trade_no, paid: data.trade_state === 'SUCCESS', providerRef: data.transaction_id };
  }
}

export function getProvider(name: string): PaymentProvider {
  switch (name) {
    case 'stripe':
      return new StripeProvider();
    case 'alipay':
      return new AlipayProvider();
    case 'wechat':
      return new WechatProvider();
    case 'mock':
    default:
      return new MockProvider();
  }
}
