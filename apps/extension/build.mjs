#!/usr/bin/env node
// 打包浏览器插件为 zip（Chrome MV3 / Firefox MV2）。
// 完全跨平台：复制用 fs.cpSync；压缩用内置 zlib 自写 ZIP（始终用正斜杠路径，
// 不依赖系统 zip / cp / PowerShell，CI 与 Windows / macOS / Linux 行为一致）。
import { mkdirSync, copyFileSync, rmSync, existsSync, cpSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { deflateRawSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const target = process.argv[2] || 'all';
const dist = path.join(__dirname, 'dist');
mkdirSync(dist, { recursive: true });

const shared = [
  'background.js',
  'common.js',
  'browser-polyfill.js',
  'popup.html',
  'popup.js',
  'options.html',
  'options.js',
  'icons',
];

// ---- 最小 ZIP 写入器（store/deflate，正斜杠路径）----
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

// 递归收集目录下所有文件，返回 { name(posix 相对路径), data } 列表
function collectFiles(rootDir) {
  const out = [];
  const walk = (abs, rel) => {
    for (const entry of readdirSync(abs).sort()) {
      const childAbs = path.join(abs, entry);
      const childRel = rel ? `${rel}/${entry}` : entry;
      if (statSync(childAbs).isDirectory()) walk(childAbs, childRel);
      else out.push({ name: childRel, data: readFileSync(childAbs) });
    }
  };
  walk(rootDir, '');
  return out;
}

function writeZip(rootDir, outPath) {
  const files = collectFiles(rootDir);
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const f of files) {
    const nameBuf = Buffer.from(f.name, 'utf8');
    const crc = crc32(f.data);
    const compressed = deflateRawSync(f.data);
    const useDeflate = compressed.length < f.data.length;
    const method = useDeflate ? 8 : 0;
    const body = useDeflate ? compressed : f.data;

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4); // version needed
    local.writeUInt16LE(0x0800, 6); // flags: utf-8 names
    local.writeUInt16LE(method, 8);
    local.writeUInt16LE(0, 10); // mod time
    local.writeUInt16LE(0x21, 12); // mod date (1980-01-01)
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(body.length, 18);
    local.writeUInt32LE(f.data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28); // extra len
    locals.push(local, nameBuf, body);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4); // version made by
    central.writeUInt16LE(20, 6); // version needed
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(method, 10);
    central.writeUInt16LE(0, 12);
    central.writeUInt16LE(0x21, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(body.length, 20);
    central.writeUInt32LE(f.data.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt16LE(0, 30); // extra
    central.writeUInt16LE(0, 32); // comment
    central.writeUInt16LE(0, 34); // disk
    central.writeUInt16LE(0, 36); // internal attrs
    central.writeUInt32LE(0, 38); // external attrs
    central.writeUInt32LE(offset, 42);
    centrals.push(central, nameBuf);

    offset += local.length + nameBuf.length + body.length;
  }

  const centralBuf = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralBuf.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);

  writeFileSync(outPath, Buffer.concat([...locals, centralBuf, end]));
}

function zipFor(name, manifestSrc) {
  const stage = path.join(dist, `stage-${name}`);
  rmSync(stage, { recursive: true, force: true });
  mkdirSync(stage, { recursive: true });
  for (const f of shared) {
    const src = path.join(__dirname, f);
    if (!existsSync(src)) continue;
    cpSync(src, path.join(stage, f), { recursive: true });
  }
  copyFileSync(path.join(__dirname, manifestSrc), path.join(stage, 'manifest.json'));
  const out = path.join(dist, `zhicang-${name}.zip`);
  rmSync(out, { force: true });
  writeZip(stage, out);
  rmSync(stage, { recursive: true, force: true });
  console.log('built', out);
}

if (target === 'chrome' || target === 'all') zipFor('chrome', 'manifest.json');
if (target === 'firefox' || target === 'all') zipFor('firefox', 'manifest.firefox.json');
