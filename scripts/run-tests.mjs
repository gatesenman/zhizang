// 跨平台测试运行器：发现指定目录下的 *.test.ts 并用 Node 内置 test runner 执行。
// 背景：`node --test test/*.test.ts` 依赖 shell 展开 glob，在 Windows（cmd/pnpm）下
// 不会展开，导致 "Could not find ...*.test.ts"。这里用 Node 自行发现文件，规避平台差异。
//
// 用法：
//   node ../../scripts/run-tests.mjs [dir] [--project tsconfig.test.json]
//   dir            测试目录，默认 "test"
//   --project P    设置 TS_NODE_PROJECT=P（跨平台替代内联环境变量）
import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

const argv = process.argv.slice(2);
let dir = 'test';
let project;
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === '--project') project = argv[++i];
  else dir = argv[i];
}

let files = [];
try {
  files = readdirSync(dir)
    .filter((f) => f.endsWith('.test.ts'))
    .sort()
    .map((f) => join(dir, f));
} catch {
  console.log(`[run-tests] 测试目录不存在：${dir}`);
  process.exit(0);
}
if (files.length === 0) {
  console.log(`[run-tests] ${dir} 下没有 *.test.ts，跳过`);
  process.exit(0);
}

const env = { ...process.env };
if (project) env.TS_NODE_PROJECT = project;

const res = spawnSync(process.execPath, ['--require', 'ts-node/register', '--test', ...files], {
  stdio: 'inherit',
  env,
});
process.exit(res.status ?? 1);
