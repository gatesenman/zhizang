// Scope Electron ABI work to this app, not optional drivers in other workspaces.
const { resolve } = require('node:path');
const { rebuild } = require('@electron/rebuild');
const desktop = resolve(__dirname, '..');
async function rebuildDesktopNative(options = {}) {
  const pkg = require('../package.json');
  const { createRequire } = require('node:module');
  const appRequire = createRequire(resolve(desktop, 'package.json'));
  if (appRequire('better-sqlite3/package.json').version !== '13.2.0') throw new Error('Expected reviewed Node-API desktop SQLite 13.2.0');
  await rebuild({ buildPath: desktop, projectRootPath: desktop, electronVersion: pkg.build.electronVersion,
    platform: options.platform || process.platform, arch: options.arch || process.arch,
    onlyModules: ['better-sqlite3'], mode: 'sequential' });
}
module.exports = rebuildDesktopNative;
if (require.main === module) rebuildDesktopNative().catch((error) => { console.error(error); process.exitCode = 1; });
