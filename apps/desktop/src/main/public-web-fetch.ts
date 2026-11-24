import { lookup } from 'node:dns/promises';
import { BlockList, isIP } from 'node:net';
import { netFetch } from './net-fetch';

type Resolver = (hostname: string) => Promise<{ address: string; family: number }[]>;
const resolveHost: Resolver = (hostname) => lookup(hostname, { all: true, verbatim: true });
const blockedV4 = new BlockList();
const blockedV6 = new BlockList();
for (const [ip, prefix] of [['0.0.0.0', 8], ['10.0.0.0', 8], ['127.0.0.0', 8], ['100.64.0.0', 10], ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.168.0.0', 16], ['192.0.0.0', 24], ['192.0.2.0', 24], ['198.18.0.0', 15], ['198.51.100.0', 24], ['203.0.113.0', 24], ['224.0.0.0', 4], ['240.0.0.0', 4]] as const) blockedV4.addSubnet(ip, prefix, 'ipv4');
for (const [ip, prefix] of [['::', 96], ['::ffff:0:0', 96], ['64:ff9b::', 96], ['fc00::', 7], ['fe80::', 10], ['ff00::', 8], ['2001:db8::', 32], ['2001::', 32], ['2002::', 16]] as const) blockedV6.addSubnet(ip, prefix, 'ipv6');
export async function assertPublicWebUrl(raw: string, resolver: Resolver = resolveHost): Promise<void> {
  const url = new URL(raw);
  const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '');
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || raw.length > 8192) throw new Error('自动抓取仅允许不含凭据的 HTTP/HTTPS 网页');
  if (hostname === 'localhost' || hostname.endsWith('.localhost') || hostname.endsWith('.local') || (!isIP(hostname) && !hostname.includes('.'))) throw new Error('自动抓取不访问本机或内网地址');
  const addresses = isIP(hostname) ? [{ address: hostname, family: isIP(hostname) }] : await resolver(hostname);
  if (!addresses.length || addresses.some(({ address }) => !isIP(address) || (isIP(address) === 6 ? blockedV6.check(address, 'ipv6') : blockedV4.check(address, 'ipv4')))) throw new Error('自动抓取不访问本机、内网或保留地址');
}
export async function abortable<T>(work: Promise<T>, signal?: AbortSignal | null): Promise<T> {
  if (!signal) return work;
  signal.throwIfAborted();
  let abort!: () => void;
  const cancelled = new Promise<never>((_resolve, reject) => { abort = () => reject(signal.reason ?? new Error('抓取已取消')); signal.addEventListener('abort', abort, { once: true }); });
  try { return await Promise.race([work, cancelled]); } finally { signal.removeEventListener('abort', abort); }
}
// This is only for untrusted public web content, never user-configured AI/sync services.
// DNS checks reduce SSRF but cannot pin Chromium/proxy DNS; use egress filtering for rebinding threats.
export async function fetchPublicWeb(raw: string, init: RequestInit = {}, transport: typeof fetch = netFetch, resolver: Resolver = resolveHost): Promise<Response> {
  if (!['GET', 'HEAD'].includes((init.method ?? 'GET').toUpperCase())) throw new Error('网页抓取仅支持 GET/HEAD');
  const headers = new Headers(init.headers);
  for (const key of ['Authorization', 'Proxy-Authorization', 'Cookie', 'X-Api-Key']) headers.delete(key);
  let target = raw;
  for (let redirects = 0; redirects <= 5; redirects++) {
    init.signal?.throwIfAborted();
    await abortable(assertPublicWebUrl(target, resolver), init.signal);
    const response = await transport(target, { ...init, headers, redirect: 'manual', credentials: 'omit', referrerPolicy: 'no-referrer' });
    const location = response.headers.get('location');
    if (response.status >= 300 && response.status < 400 && location) {
      await response.body?.cancel();
      if (redirects === 5) throw new Error('网页重定向次数过多');
      target = new URL(location, target).href;
      continue;
    }
    return response;
  }
  throw new Error('网页重定向次数过多');
}
export const publicWebFetch: typeof fetch = (input, init) => fetchPublicWeb(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url, init);

export async function readLimitedBytes(response: Response, maxBytes: number): Promise<Uint8Array> {
  if (Number(response.headers.get('content-length')) > maxBytes) { await response.body?.cancel(); throw new Error('网页响应超过大小限制'); }
  if (!response.body) return new Uint8Array();
  const reader = response.body.getReader(); const chunks: Uint8Array[] = []; let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read(); if (done) break;
      size += value.byteLength;
      if (size > maxBytes) { await reader.cancel(); throw new Error('网页响应超过大小限制'); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return bytes;
}
export async function readLimitedText(response: Response, maxBytes = 5_000_000): Promise<string> { return new TextDecoder().decode(await readLimitedBytes(response, maxBytes)); }
