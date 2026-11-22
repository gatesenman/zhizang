export interface UpdatePolicy { enabled: boolean; url: string; reason?: string }
export function updatePolicy(enabled: string | null, input: string | null): UpdatePolicy {
  if (enabled !== '1') return { enabled: false, url: '', reason: '自动更新未启用。当前可正常使用；发行方配置更新源后可开启。' };
  try {
    const u = new URL((input || '').trim());
    if (u.username || u.password || u.search || u.hash || (u.protocol !== 'https:' && !(u.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(u.hostname)))) throw new Error();
    return { enabled: true, url: u.toString().replace(/\/$/, '') };
  } catch { return { enabled: false, url: '', reason: '尚未配置有效更新源。请填写发行方提供的 HTTPS 更新目录，不能使用仓库占位地址。' }; }
}
