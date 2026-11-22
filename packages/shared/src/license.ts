import jwt from 'jsonwebtoken';
import type { LicensePayload } from './types';

// 许可证签名 / 验签。
// 后端用私钥签发，桌面端内置公钥验签（RS256），支持离线宽限。

export function signLicense(
  payload: LicensePayload,
  privateKeyPem: string,
  expiresInSeconds: number,
): string {
  return jwt.sign(payload, privateKeyPem, {
    algorithm: 'RS256',
    expiresIn: expiresInSeconds,
  });
}

export function verifyLicense(token: string, publicKeyPem: string): LicensePayload | null {
  try {
    const decoded = jwt.verify(token, publicKeyPem, { algorithms: ['RS256'] });
    return decoded as LicensePayload;
  } catch {
    return null;
  }
}

// 设备指纹：machine-id 与盐做哈希（实际哈希在调用方完成，这里只做规范化）
export function normalizeDeviceId(raw: string): string {
  return raw.trim().toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 64);
}
