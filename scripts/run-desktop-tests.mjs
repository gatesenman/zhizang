// Desktop SQLite is compiled for Electron by postinstall, not the host Node ABI.
// Run its real persistence tests with the exact same runtime as the desktop app.
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const require = createRequire(new URL('../apps/desktop/package.json', import.meta.url));
const electron = require('electron');
const script = fileURLToPath(new URL('./run-tests.mjs', import.meta.url));
const result = spawnSync(electron, [script, 'test', '--project', 'tsconfig.test.json'], {
  cwd: fileURLToPath(new URL('../apps/desktop', import.meta.url)),
  env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }, stdio: 'inherit',
});
if (result.error) console.error(result.error.message);
process.exit(result.status ?? 1);
