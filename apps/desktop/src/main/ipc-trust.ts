export function assertTrustedIpc(event: { sender: unknown; senderFrame: { url: string } | null }, sender: unknown, frame: { url: string }, rendererUrl: string): void {
  if (event.sender !== sender || !event.senderFrame || event.senderFrame !== frame) throw new Error('拒绝非主窗口 IPC 请求');
  const actual = new URL(event.senderFrame.url); const expected = new URL(rendererUrl);
  actual.hash = ''; actual.search = ''; expected.hash = ''; expected.search = '';
  if (!['file:', 'http:', 'https:'].includes(actual.protocol) || actual.href !== expected.href) throw new Error('拒绝非应用页面 IPC 请求');
}
