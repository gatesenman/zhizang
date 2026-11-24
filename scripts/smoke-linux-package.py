"""Exact Linux ZIP + isolated real renderer/IPC/SQLite smoke; NOT visual acceptance.
Requires Node24, Python3, xvfb-run, installed deps and matching desktop build.
RAM holds data only. Executables run from --work-dir. Only owned temp dirs removed.
"""
import argparse, hashlib, json, os, signal, socket, sqlite3, stat, subprocess, tempfile, time, urllib.error, urllib.request, zipfile
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
p = argparse.ArgumentParser(); p.add_argument('archive', type=Path); p.add_argument('--work-dir', type=Path, required=True); p.add_argument('--ram-dir', type=Path, default=Path(tempfile.gettempdir())); p.add_argument('--result', type=Path, required=True); p.add_argument('--screenshot', type=Path)
a = p.parse_args(); a.work_dir.mkdir(parents=True, exist_ok=True)
def digest(file):
 h = hashlib.sha256()
 with file.open('rb') as f:
  for b in iter(lambda: f.read(1024 * 1024), b''): h.update(b)
 return h.hexdigest()
def port():
 with socket.socket() as s: s.bind(('127.0.0.1', 0)); return s.getsockname()[1]
def stop(process):
 if process.poll() is None:
  os.killpg(process.pid, signal.SIGTERM)
  try: process.wait(timeout=10)
  except subprocess.TimeoutExpired: os.killpg(process.pid, signal.SIGKILL); process.wait()
with tempfile.TemporaryDirectory(prefix='zhizang-package-data-', dir=a.ram_dir) as data, tempfile.TemporaryDirectory(prefix='zhizang-package-exec-', dir=a.work_dir) as executable:
 data = Path(data); run = Path(executable); extracted = data/'extracted'; extracted.mkdir()
 with zipfile.ZipFile(a.archive) as z:
  assert z.testzip() is None
  for info in z.infolist():
   name = Path(info.filename); mode = info.external_attr >> 16
   assert not name.is_absolute() and '..' not in name.parts and not stat.S_ISLNK(mode), info.filename
   assert name.name != 'AppRun', 'AppImage launcher must not ship'
  z.extractall(extracted)
  modes = {x.filename: (x.external_attr >> 16) & 0o777 for x in z.infolist()}
 runtime = ROOT/'node_modules/electron/dist'; sqlite = ROOT/'apps/desktop/node_modules/better-sqlite3'
 def elf(file):
  with file.open('rb') as f: return f.read(4) == b'\x7fELF'
 binaries = [x for x in extracted.iterdir() if x.is_file() and elf(x) and '.so' not in x.name and x.name not in ['chrome-sandbox', 'chrome_crashpad_handler']]
 assert len(binaries) == 1, [x.name for x in binaries]
 binary = binaries[0]
 for file in extracted.rglob('*'):
  rel = file.relative_to(extracted); dest = run/rel
  if file.is_dir(): dest.mkdir(exist_ok=True); continue
  candidates = [runtime/rel]
  if file == binary: candidates.insert(0, runtime/'electron')
  prefix = 'resources/app.asar.unpacked/node_modules/better-sqlite3/'
  if rel.as_posix().startswith(prefix): candidates.append(sqlite/rel.as_posix()[len(prefix):])
  source = next((x for x in candidates if x.is_file() and x.stat().st_size == file.stat().st_size and digest(x) == digest(file)), None)
  if source:
   try: os.link(source, dest); continue
   except OSError: pass
  import shutil
  shutil.copyfile(file, dest); dest.chmod(modes.get(rel.as_posix(), 0o644) or 0o644)
 asar = run/'resources/app.asar'
 code = "const fs=require('node:fs'),a=require('@electron/asar');for(const f of ['main/index.js','preload/index.js'])if(!a.extractFile(process.argv[1],'out/'+f).equals(fs.readFileSync('apps/desktop/out/'+f)))throw Error('build mismatch '+f);const files=a.listPackage(process.argv[1]);if(files.some(f=>/node_modules\\/(vite|tar)\\//.test(f)))throw Error('unexpected build-only dependency');const runtimes=files.filter(f=>f.endsWith('/builder-util-runtime/package.json'));if(!runtimes.length)throw Error('missing updater runtime metadata');for(const f of runtimes)if(!['9.7.0','9.7.1'].includes(JSON.parse(a.extractFile(process.argv[1],f.replace(/^\\//,''))).version))throw Error('old builder runtime');console.log('exact main/preload, runtime-only ASAR checked');"
 subprocess.run(['node', '-e', code, str(asar)], cwd=ROOT, check=True)
 versions = json.loads(subprocess.check_output([str(run/binary.name), '-p', 'JSON.stringify(process.versions)'], env={**os.environ, 'ELECTRON_RUN_AS_NODE':'1'}, text=True)); assert versions['electron']=='45.4.1'
 profile = data/'profile'; profile.mkdir(); bridge = port()
 with sqlite3.connect(profile/'zhicang.db') as db:
  db.execute('CREATE TABLE settings(key TEXT PRIMARY KEY,value TEXT)'); db.executemany('INSERT INTO settings VALUES(?,?)', [('bridgePort',str(bridge)),('license_token','expired-fixture-only'),('local_mode','0'),('sync_auto_enabled','1')])
 results=[]; bookmark=None
 for restart in range(2):
  debugger=port(); env={**os.environ,'ZHICANG_USER_DATA_DIR':str(profile)}; env.pop('ELECTRON_RUN_AS_NODE',None)
  args=['xvfb-run','-a',str(run/binary.name),'--disable-gpu',f'--remote-debugging-port={debugger}','--remote-debugging-address=127.0.0.1']
  if os.geteuid()==0: args.append('--no-sandbox') # root-only disposable CI, never daily usage guidance
  with (a.work_dir/f'linux-041-startup-{restart}.log').open('w') as log:
   process=subprocess.Popen(args, env=env, stdout=log, stderr=subprocess.STDOUT, start_new_session=True)
   try:
    deadline=time.monotonic()+40
    while True:
     assert process.poll() is None, 'app exited early'
     try:
      with urllib.request.urlopen(f'http://127.0.0.1:{bridge}/api/ping',timeout=1) as response: assert json.load(response)['version']=='0.4.1'
      with urllib.request.urlopen(f'http://127.0.0.1:{debugger}/json/list',timeout=1) as response: targets=json.load(response)
      if any(t.get('url','').startswith('file:') and '/out/renderer/index.html' in t['url'] for t in targets): break
     except (OSError,urllib.error.URLError): pass
     assert time.monotonic()<deadline, 'readiness timeout'; time.sleep(.2)
    def probe(action, value='', screenshot=None):
     cmd=['node', str(ROOT/'scripts/probe-desktop-renderer.cjs'),str(debugger),action,str(value)]
     if screenshot: cmd.append(str(screenshot))
     return json.loads(subprocess.check_output(cmd,cwd=ROOT,text=True,timeout=25))
    if not restart:
     created=probe('create');bookmark=created['id'];results.append(created)
     with sqlite3.connect(profile/'zhicang.db') as db: db.execute('INSERT OR REPLACE INTO snapshots VALUES(?,?,?)',(bookmark,'<article>offline package fixture</article>',int(time.time()*1000)))
    results.append(probe('read',bookmark,a.screenshot if not restart else None))
    try: urllib.request.urlopen(f'http://127.0.0.1:{bridge}/api/search?q=fixture',timeout=2); raise AssertionError('missing bridge auth')
    except urllib.error.HTTPError as e: assert e.code==401
    with sqlite3.connect(profile/'zhicang.db') as db:
     settings=dict(db.execute('SELECT key,value FROM settings'));assert settings['license_token']=='expired-fixture-only';assert settings.get('sync_account_session') is None;assert settings.get('sync_auto_enabled_v2') is None
    try: process.wait(timeout=3);raise AssertionError('delayed startup exit')
    except subprocess.TimeoutExpired: pass
   finally: stop(process)
 result={'result':'PASS','version':'0.4.1','packageSHA256':digest(a.archive),'packageSizeBytes':a.archive.stat().st_size,'electronVersions':versions,'packagedMainPreloadMatch':True,'checks':['ZIP CRC/path/no-AppRun','exact executable-disk package, SHA-matched hardlink deduplication','guarded real renderer IPC','collect/organize/search/offline read/no-key reuse','actual app restart persistence','obsolete license retained without activation','private bridge401'], 'rendererResults':results,'limitations':['headless programmatic smoke, not visual GUI acceptance','offline read fixture inserted into isolated SQLite; no real site/AI download','temporary loopback debugger used only for isolated test process','no Windows/macOS installer, external AI or cloud deployment validation']}
 a.result.write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n');print(json.dumps(result,ensure_ascii=False))
