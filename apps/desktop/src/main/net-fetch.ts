import { net } from 'electron';

// 统一走 Electron net 模块（Chromium 网络栈）：自动复用系统代理与操作系统证书库，
// 比 Node 自带的 undici fetch 更可靠——后者在企业代理 / 自签证书环境下常报 `fetch failed`。
// net.fetch 必须在 app ready 之后调用；站点富化、云同步、激活、API 向量均发生在运行期，满足条件。
export const netFetch: typeof fetch = (input: any, init?: any) =>
  net.fetch(input, init) as Promise<Response>;
