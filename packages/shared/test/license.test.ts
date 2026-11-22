import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { signLicense, verifyLicense, normalizeDeviceId } from '../src/license';
import type { LicensePayload } from '../src/types';

function genKeys(): { privateKey: string; publicKey: string } {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
  return { privateKey, publicKey };
}

const payload: LicensePayload = {
  sub: 'buyer@test.com',
  deviceId: 'devicefingerprintabc',
  code: '4F5P3-TTRK5-5M64V-XH6JJ',
  plan: 'pro',
};

test('signLicense + verifyLicense round-trips (RS256)', () => {
  const { privateKey, publicKey } = genKeys();
  const token = signLicense(payload, privateKey, 3600);
  const decoded = verifyLicense(token, publicKey);
  assert.ok(decoded, '应能验签通过');
  assert.equal(decoded!.sub, payload.sub);
  assert.equal(decoded!.deviceId, payload.deviceId);
  assert.equal(decoded!.code, payload.code);
  assert.equal(decoded!.plan, payload.plan);
  assert.ok(typeof decoded!.exp === 'number' && decoded!.exp! > decoded!.iat!);
});

test('verifyLicense rejects token signed by a different key', () => {
  const a = genKeys();
  const b = genKeys();
  const token = signLicense(payload, a.privateKey, 3600);
  assert.equal(verifyLicense(token, b.publicKey), null, '用错误公钥应返回 null');
});

test('verifyLicense rejects expired token', async () => {
  const { privateKey, publicKey } = genKeys();
  const token = signLicense(payload, privateKey, -1); // 立即过期
  assert.equal(verifyLicense(token, publicKey), null, '过期 token 应返回 null');
});

test('verifyLicense rejects tampered token', () => {
  const { privateKey, publicKey } = genKeys();
  const token = signLicense(payload, privateKey, 3600);
  const tampered = token.slice(0, -3) + (token.endsWith('a') ? 'bbb' : 'aaa');
  assert.equal(verifyLicense(tampered, publicKey), null, '被篡改的 token 应返回 null');
});

test('normalizeDeviceId 规范化设备指纹', () => {
  assert.equal(normalizeDeviceId('  AB-CD:12 '), 'abcd12');
  assert.equal(normalizeDeviceId('a'.repeat(100)).length, 64);
});
