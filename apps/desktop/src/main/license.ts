import { app } from 'electron';
import { hostname } from 'os';
import { createHash, randomUUID } from 'crypto';
import { verifyLicense, normalizeDeviceId } from '@zhicang/shared';
import type { LicenseStatus, LicensePayload } from '@zhicang/shared';
import { getSetting, setSetting } from './db';
import { normalizeApiBase } from './service-url';
import { netFetch } from './net-fetch';

// 与后端 keys/license_private.pem 配对的公钥（验签用）。
// 生产环境请替换为你自己的密钥对。
const LEGACY_LICENSE_PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAls5HZwmNxpY3WfWkulLB
nR7PnEVHXiXcgKOZuCGMUJOB3PPwsnjaWcp+k1kpacbUCvWFfyHGJ8OrMbAp7ZtD
9CdfAeYFnE9PpqDJ2nVt/41ZMl+q9pp45eb/3LsimiuiZj1+kpWOMNXikEv5BYrG
I4/hDC2/TTcEKVRF7S1fmMfrfJwHXdi0Nqo9uR9pVf31rezlNB8V/Nmqd1nOsnNj
h4OcRbMbUYZKrYtZ8fIxQRvFimRsEn86Tzl+myLTjZGaimtHucVn+5BHMRyaW3nJ
bgiXiZda9Qx8jkrEuEEnlXIOE6TtU8DxEHIvVhLPR5JPZ2Sn2xfrEp4p+RYKd8Og
rQIDAQAB
-----END PUBLIC KEY-----`;

const LICENSE_PUBLIC_KEY = process.env.ZHICANG_LICENSE_PUBLIC_KEY || LEGACY_LICENSE_PUBLIC_KEY;

const BACKEND_URL_KEY = 'backend_url';
const LICENSE_TOKEN_KEY = 'license_token';
const LICENSE_EMAIL_KEY = 'license_email';
const DEVICE_SALT_KEY = 'device_salt';

export function getBackendUrl(): string {
  return normalizeApiBase(getSetting(BACKEND_URL_KEY) || 'http://localhost:3001');
}

export function setBackendUrl(url: string): void {
  const next = normalizeApiBase(url);
  if (getBackendUrl() !== next) setSetting('last_sync_at', '0');
  setSetting(BACKEND_URL_KEY, next);
}

export function getDeviceId(): string {
  let salt = getSetting(DEVICE_SALT_KEY);
  if (!salt) {
    salt = randomUUID();
    setSetting(DEVICE_SALT_KEY, salt);
  }
  const raw = createHash('sha256').update(`${hostname()}::${salt}`).digest('hex');
  return normalizeDeviceId(raw);
}

export function getLicenseStatus(): LicenseStatus {
  const token = getSetting(LICENSE_TOKEN_KEY);
  if (!token) return { activated: false, reason: '未激活' };
  const payload = verifyLicense(token, LICENSE_PUBLIC_KEY) as LicensePayload | null;
  if (!payload) return { activated: false, reason: '许可证无效或已过期' };
  if (payload.deviceId !== getDeviceId()) {
    return { activated: false, reason: '许可证与当前设备不匹配' };
  }
  return {
    activated: true,
    plan: payload.plan,
    expireAt: payload.exp ? payload.exp * 1000 : null,
    email: getSetting(LICENSE_EMAIL_KEY) || payload.sub,
  };
}

export async function activate(email: string, code: string, transport: typeof fetch = netFetch): Promise<LicenseStatus> {
  const res = await transport(`${getBackendUrl().replace(/\/$/, '')}/license/activate`, {
    method: 'POST',
    signal: AbortSignal.timeout(30000),
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, code, deviceId: getDeviceId() }),
  });
  const data: any = await res.json().catch(() => ({}));
  if (!res.ok || !data.token) {
    return { activated: false, reason: data.message || `激活失败 (${res.status})` };
  }
  const payload = verifyLicense(data.token, LICENSE_PUBLIC_KEY);
  if (!payload) return { activated: false, reason: '许可证验签失败' };
  setSetting(LICENSE_TOKEN_KEY, data.token);
  setSetting(LICENSE_EMAIL_KEY, email);
  return getLicenseStatus();
}

export function deactivate(): void {
  setSetting(LICENSE_TOKEN_KEY, '');
}

export function getLicenseToken(): string | null {
  return getSetting(LICENSE_TOKEN_KEY) || null;
}

export function getLicenseEmail(): string | null {
  return getSetting(LICENSE_EMAIL_KEY) || null;
}

void app;
