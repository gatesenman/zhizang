import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as crypto from 'node:crypto';
import { getProvider, aesGcmDecrypt } from '../src/payment/providers';
import type { ProviderContext } from '../src/payment/providers';

// 用内存 map 模拟 SettingsService.get
function ctxWith(map: Record<string, string>): ProviderContext {
  return {
    publicBaseUrl: 'https://api.example.com',
    portalUrl: 'https://buy.example.com',
    settings: { get: async (k: string) => map[k] },
  } as unknown as ProviderContext;
}

function rsaKeys(): { privateKey: string; publicKey: string } {
  const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
  return { privateKey, publicKey };
}

// ---------------------------------------------------------------- Stripe
test('Stripe webhook：合法签名 -> paid，订单号正确', async () => {
  const secret = 'whsec_test_secret_123';
  const event = {
    type: 'checkout.session.completed',
    data: { object: { id: 'cs_test_1', client_reference_id: 'order-1', payment_status: 'paid' } },
  };
  const rawBody = Buffer.from(JSON.stringify(event));
  const t = Math.floor(Date.now() / 1000);
  const v1 = crypto.createHmac('sha256', secret).update(`${t}.${rawBody.toString('utf8')}`).digest('hex');
  const res = await getProvider('stripe').verifyWebhook(
    { rawBody, headers: { 'stripe-signature': `t=${t},v1=${v1}` } },
    ctxWith({ 'payment.stripe.webhookSecret': secret }),
  );
  assert.deepEqual(res, { orderId: 'order-1', paid: true, providerRef: 'cs_test_1' });
});

test('Stripe webhook：篡改 body -> 抛错（签名失败）', async () => {
  const secret = 'whsec_test_secret_123';
  const event = { type: 'checkout.session.completed', data: { object: { id: 'cs_1', client_reference_id: 'order-1', payment_status: 'paid' } } };
  const rawBody = Buffer.from(JSON.stringify(event));
  const t = Math.floor(Date.now() / 1000);
  const v1 = crypto.createHmac('sha256', secret).update(`${t}.${rawBody.toString('utf8')}`).digest('hex');
  const tampered = Buffer.from(JSON.stringify({ ...event, data: { object: { id: 'cs_1', client_reference_id: 'order-EVIL', payment_status: 'paid' } } }));
  await assert.rejects(
    () => getProvider('stripe').verifyWebhook({ rawBody: tampered, headers: { 'stripe-signature': `t=${t},v1=${v1}` } }, ctxWith({ 'payment.stripe.webhookSecret': secret })),
    /签名校验失败/,
  );
});

test('Stripe webhook：过期时间戳 -> 抛错', async () => {
  const secret = 'whsec_test_secret_123';
  const rawBody = Buffer.from('{}');
  const t = Math.floor(Date.now() / 1000) - 1000; // 超过 300s 容忍
  const v1 = crypto.createHmac('sha256', secret).update(`${t}.{}`).digest('hex');
  await assert.rejects(
    () => getProvider('stripe').verifyWebhook({ rawBody, headers: { 'stripe-signature': `t=${t},v1=${v1}` } }, ctxWith({ 'payment.stripe.webhookSecret': secret })),
    /时间戳过期/,
  );
});

// ---------------------------------------------------------------- 支付宝 RSA2
function alipaySignContent(params: Record<string, string>, excludeSignType: boolean): string {
  return Object.keys(params)
    .filter((k) => k !== 'sign' && (!excludeSignType || k !== 'sign_type'))
    .filter((k) => params[k] !== '' && params[k] != null)
    .sort()
    .map((k) => `${k}=${params[k]}`)
    .join('&');
}

test('支付宝 notify：RSA2 验签通过 -> paid', async () => {
  const { privateKey, publicKey } = rsaKeys();
  const params: Record<string, string> = {
    app_id: '2021000000000000',
    out_trade_no: 'order-2',
    trade_no: '2024061322001400000000000001',
    trade_status: 'TRADE_SUCCESS',
    total_amount: '18.00',
    sign_type: 'RSA2',
    gmt_payment: '2026-06-13 16:00:00',
  };
  const content = alipaySignContent(params, true);
  params.sign = crypto.createSign('RSA-SHA256').update(content, 'utf8').sign(privateKey, 'base64');
  const rawBody = Buffer.from(new URLSearchParams(params).toString());
  const res = await getProvider('alipay').verifyWebhook({ rawBody, headers: {} }, ctxWith({ 'payment.alipay.publicKey': publicKey }));
  assert.deepEqual(res, { orderId: 'order-2', paid: true, providerRef: '2024061322001400000000000001' });
});

test('支付宝 notify：签名与内容不一致 -> 抛错', async () => {
  const { privateKey, publicKey } = rsaKeys();
  const params: Record<string, string> = { out_trade_no: 'order-2', trade_status: 'TRADE_SUCCESS', sign_type: 'RSA2' };
  const content = alipaySignContent(params, true);
  params.sign = crypto.createSign('RSA-SHA256').update(content, 'utf8').sign(privateKey, 'base64');
  // 篡改金额（参与验签）
  params.trade_status = 'WAIT_BUYER_PAY';
  const rawBody = Buffer.from(new URLSearchParams(params).toString());
  await assert.rejects(
    () => getProvider('alipay').verifyWebhook({ rawBody, headers: {} }, ctxWith({ 'payment.alipay.publicKey': publicKey })),
    /签名校验失败/,
  );
});

// ---------------------------------------------------------------- 微信 v3 AEAD
function wechatEncrypt(apiV3Key: string, nonce: string, ad: string, plaintext: string): string {
  const cipher = crypto.createCipheriv('aes-256-gcm', Buffer.from(apiV3Key, 'utf8'), Buffer.from(nonce, 'utf8'));
  cipher.setAAD(Buffer.from(ad, 'utf8'));
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([enc, tag]).toString('base64');
}

test('微信 aesGcmDecrypt：加解密 round-trip', () => {
  const apiV3Key = '12345678901234567890123456789012'; // 32 bytes
  const nonce = 'abcdef123456'; // 12 bytes
  const ad = 'transaction';
  const plain = JSON.stringify({ hello: '世界' });
  const ct = wechatEncrypt(apiV3Key, nonce, ad, plain);
  assert.equal(aesGcmDecrypt(apiV3Key, nonce, ad, ct), plain);
});

test('微信 webhook：解密回调资源 -> paid', async () => {
  const apiV3Key = '12345678901234567890123456789012';
  const nonce = 'abcdef123456';
  const ad = 'transaction';
  const resource = JSON.stringify({ out_trade_no: 'order-3', trade_state: 'SUCCESS', transaction_id: 'wx-tx-1' });
  const ciphertext = wechatEncrypt(apiV3Key, nonce, ad, resource);
  const rawBody = Buffer.from(JSON.stringify({ resource: { ciphertext, nonce, associated_data: ad } }));
  // 不配置 platformPublicKey -> 跳过回调签名校验，仅验解密链路
  const res = await getProvider('wechat').verifyWebhook({ rawBody, headers: {} }, ctxWith({ 'payment.wechat.apiV3Key': apiV3Key }));
  assert.deepEqual(res, { orderId: 'order-3', paid: true, providerRef: 'wx-tx-1' });
});

test('getProvider 回退到 mock', () => {
  assert.equal(getProvider('unknown').name, 'mock');
  assert.equal(getProvider('stripe').name, 'stripe');
  assert.equal(getProvider('alipay').name, 'alipay');
  assert.equal(getProvider('wechat').name, 'wechat');
});
