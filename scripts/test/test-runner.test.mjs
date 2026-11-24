import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../../', import.meta.url));
const runner = join(root, 'scripts/run-tests.mjs');
test('R10 cross-platform runner fails unreadable/empty directories and executes a real TypeScript fixture', () => {
  const dir = mkdtempSync(join(tmpdir(), 'zhizang-runner-'));
  try {
    assert.notEqual(spawnSync(process.execPath, [runner, join(dir, 'missing')]).status, 0);
    mkdirSync(join(dir, 'empty'));
    assert.notEqual(spawnSync(process.execPath, [runner, join(dir, 'empty')]).status, 0);
    assert.notEqual(spawnSync(process.execPath, [runner, '--project']).status, 0);
    writeFileSync(join(dir, 'package.json'), '{"type":"commonjs"}');
    writeFileSync(join(dir, 'tsconfig.json'), JSON.stringify({ compilerOptions: { module: 'CommonJS', target: 'ES2022', typeRoots: [join(root, 'node_modules/@types')] } }));
    writeFileSync(join(dir, 'pass.test.ts'), "const value: number = 1; require('node:test')('real fixture', () => require('node:assert/strict').equal(value, 1));\n");
    const result = spawnSync(process.execPath, [runner, dir, '--project', join(dir, 'tsconfig.json')], { cwd: root, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.match(result.stdout, /tests 1/);
    assert.match(readFileSync(runner, 'utf8'), /--test-concurrency=1/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('CI sync smoke waits asynchronously and still asserts the actual child exit code', () => {
  const source = readFileSync(join(root, 'scripts/smoke-backend.mjs'), 'utf8');
  assert.ok(!source.includes('spawnSync'), 'a long synchronous child blocks HTTP keep-alive events');
  assert.match(source, /const \[clientCode\] = await once\(client, 'close'\)/);
  assert.match(source, /assert\.equal\(clientCode, 0/);
  assert.match(source, /timeout: 180000/);
});
