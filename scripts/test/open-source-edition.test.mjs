import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
const root = new URL('../../', import.meta.url);
const read = (p) => readFileSync(new URL(p, root), 'utf8');
function files(path) {
  return readdirSync(new URL(path, root), { withFileTypes: true }).flatMap((entry) => entry.isDirectory() ? files(join(path, entry.name)) : [join(path, entry.name)]);
}
test('no runtime activation UI, IPC, device licensing, payment or RSA key dependencies', () => {
  const sources = ['apps/desktop/src', 'apps/backend/src', 'packages/shared/src'].flatMap(files);
  for (const file of sources) {
    assert.doesNotMatch(read(file), /license:|getLicenseStatus|verifyLicense|signLicense|LicenseGate|LicenseSettings|ZHICANG_LICENSE_PUBLIC_KEY|LICENSE_PRIVATE_KEY|device_bindings|activation_codes/);
  }
  for (const path of ['apps/backend/src/payment', 'apps/backend/src/license', 'apps/portal/app/admin', 'apps/portal/app/result', 'packages/shared/src/license.ts']) {
    assert.equal(existsSync(new URL(path, root)), false, path);
  }
  assert.doesNotMatch(read('apps/desktop/src/renderer/src/App.tsx'), /trial|local_mode|activated/);
  assert.doesNotMatch(read('apps/desktop/electron.vite.config.ts'), /LICENSE_PUBLIC_KEY/);
  assert.doesNotMatch(read('docker-compose.yml') + read('scripts/deploy.sh'), /LICENSE_PRIVATE|LICENSE_PUBLIC|license_private\.pem/);
});
test('local features and safety invariants remain; external AI keys are not activation codes', () => {
  assert.match(read('apps/desktop/src/main/index.ts'), /requestSingleInstanceLock/);
  assert.match(read('apps/desktop/src/main/service-url.ts'), /validateLlmConfig/);
  assert.match(read('apps/desktop/src/main/bridge.ts'), /127\.0\.0\.1/);
  assert.equal(JSON.parse(read('apps/desktop/package.json')).build.nsis.deleteAppDataOnUninstall, false);
  assert.match(read('apps/desktop/src/renderer/src/components/SettingsModal.tsx'), /apiKey/);
  assert.doesNotMatch(read('apps/desktop/src/main/db.ts'), /license_token|device_salt|local_mode/);
  assert.match(read('apps/backend/src/sync/sync.controller.ts'), /@UseGuards\(JwtAuthGuard\)/);
  assert.match(read('apps/backend/src/sync/sync.controller.ts'), /account:\$\{user.id\}/);
});
test('all packages identify MIT 0.4.0 and document third-party costs and rights', () => {
  for (const path of ['package.json', 'apps/desktop/package.json', 'apps/backend/package.json', 'apps/portal/package.json', 'apps/extension/package.json', 'apps/mcp/package.json', 'packages/shared/package.json']) {
    const manifest = JSON.parse(read(path)); assert.equal(manifest.version, '0.4.0'); assert.equal(manifest.license, 'MIT');
  }
  for (const path of ['apps/extension/manifest.json', 'apps/extension/manifest.firefox.json']) assert.equal(JSON.parse(read(path)).version, '0.4.0');
  assert.match(read('apps/mcp/src/index.js'), /package\.json/);
  assert.match(read('LICENSE'), /MIT License/);
  assert.match(read('README.md'), /第三方可能收费/);
  assert.match(read('THIRD_PARTY_NOTICES.md'), /素材/);
  assert.doesNotMatch(read('apps/portal/app/page.tsx'), /fetch\(|checkout|payment\//);
});

test('container recipes preserve patch reproducibility and exclude credentials from contexts', () => {
  for (const path of ['apps/backend/Dockerfile', 'apps/portal/Dockerfile']) {
    assert.match(read(path), /COPY patches patches/);
    assert.match(read(path), /\.npmrc/);
  }
  assert.doesNotMatch(read('apps/portal/Dockerfile'), /COPY .*portal\/public/);
  assert.match(read('.dockerignore'), /\*\*\/\.env/);
  assert.match(read('.dockerignore'), /\*\*\/node_modules/);
  assert.match(read('apps/backend/src/db/data-source.ts'), /synchronize: process.env.DB_SYNC === 'true'/);
});
