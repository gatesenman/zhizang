import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
const root = fileURLToPath(new URL('../', import.meta.url));
export function windowsBuilderLibrary(project = root) {
  const appRequire = createRequire(resolve(project, 'apps/desktop/package.json'));
  const builderRequire = createRequire(appRequire.resolve('electron-builder/package.json'));
  return dirname(builderRequire.resolve('app-builder-lib/package.json'));
}
export function assertWindowsPackaging(project = root) {
  const library = windowsBuilderLibrary(project);
  const pkg = JSON.parse(readFileSync(resolve(library, 'package.json'), 'utf8'));
  assert.equal(pkg.version, '24.13.3', 'Review/backport the NSIS fix before changing the pinned builder');
  const template = readFileSync(resolve(library, 'templates/nsis/multiUser.nsh'), 'utf8');
  const record = JSON.parse(readFileSync(resolve(project, 'docs/packaging-0.3.1/NSIS-PATCH.json'), 'utf8'));
  assert.equal(createHash('sha256').update(template).digest('hex'), record.patchedTemplateSha256, 'NSIS patch missing or unexpected: use pnpm install --frozen-lockfile (not npm)');
  assert.ok(!template.includes('*$2(&w${NSIS_MAX_STRLEN} .s)'), 'Unsafe pointer over-read must not ship');
  assert.ok(template.includes("KERNEL32::lstrcpynW(w .r0, p r2, i ${NSIS_MAX_STRLEN})p"));
  return { builder: pkg.version, templateSha256: record.patchedTemplateSha256, source: record.source };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) console.log(JSON.stringify(assertWindowsPackaging()));
