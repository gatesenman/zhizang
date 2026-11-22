export function normalizeApiBase(input: string): string {
  const url = new URL(input.trim());
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw new Error('服务地址须为不含账户、查询或片段的 HTTP(S) 地址');
  const base = url.toString().replace(/\/+$/, '');
  return base.endsWith('/api') ? base : base + '/api';
}
export function validateLlmConfig(cfg: { baseUrl: string; apiKey: string; model: string }): void {
  const url = new URL(cfg.baseUrl.trim());
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('模型地址须为 HTTP(S) 地址');
  if (!cfg.apiKey.trim() || !cfg.model.trim()) throw new Error('请填写 API Key 与模型名称');
}
