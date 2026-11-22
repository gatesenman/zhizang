# Test-only isolated Windows lifecycle probe. Never drives GUI or changes security policy.
$ErrorActionPreference='Stop'
Import-Module -Name ($PSHOME+'\Modules\Microsoft.PowerShell.Management\Microsoft.PowerShell.Management.psd1') -ErrorAction Stop
Import-Module -Name ($PSHOME+'\Modules\Microsoft.PowerShell.Utility\Microsoft.PowerShell.Utility.psd1') -ErrorAction Stop
$packet='C:\Users\Administrator\ZhiCang-E2E-Packets-031-20261122-2330'
$oldRoot='E:\ZhiCang-E2E-030-20261122-2213-8f47a2'
$oldPacket='C:\Users\Administrator\ZhiCang-E2E-Packets-030-20261122-2213-8f47a2'
$root=$oldRoot+'\v031';$install=$root+'\installed';$profile=$root+'\profile-031';$temp=$root+'\temp'
$exe=$packet+'\ZhiCang-Setup-0.3.1-x64.exe'
$expected='16B67174821C252DF11E4E8168DD7C42B3468E2016F6F5BAA9EE9634084A4DB9'
$guid='fd9a587b-1572-58f2-ab07-16cba8ebd5b3'
$results=[ordered]@{Version='0.3.1';TimeZone='Asia/Shanghai UTC+8';Started=[TimeZoneInfo]::ConvertTimeBySystemTimeZoneId([DateTime]::UtcNow,'China Standard Time').ToString('s');Root=$root;GUI='NOT TESTED: no UI automation or license bypass';Status='STARTED'}
function Note([string]$s){[Console]::WriteLine($s)}
function Registrations {
 $rows=@();foreach($h in @([Microsoft.Win32.RegistryHive]::CurrentUser,[Microsoft.Win32.RegistryHive]::LocalMachine)){foreach($v in @([Microsoft.Win32.RegistryView]::Registry32,[Microsoft.Win32.RegistryView]::Registry64)){
  $b=[Microsoft.Win32.RegistryKey]::OpenBaseKey($h,$v)
  try {foreach($key in @("Software\$guid","Software\Microsoft\Windows\CurrentVersion\Uninstall\$guid")){$k=$b.OpenSubKey($key);if($k){try{$rows += [pscustomobject]@{Hive="$h";View="$v";Key=$key;InstallLocation=$k.GetValue('InstallLocation');DisplayVersion=$k.GetValue('DisplayVersion')}}finally{$k.Dispose()}}}} finally {$b.Dispose()}
 }};return $rows
}
function AppProcesses {
 $rows=@();foreach($p in [Diagnostics.Process]::GetProcesses()){if($p.ProcessName.StartsWith('ZhiCang',[StringComparison]::OrdinalIgnoreCase)){
  $path=$null;try{$path=$p.MainModule.FileName}catch{throw 'Unknown ZhiCang process cannot be identified; stop testing'}
  $rows += [pscustomobject]@{PID=$p.Id;Path=$path;StartUtc=$p.StartTime.ToUniversalTime();Process=$p}
 }};return $rows
}
function AssertOwned([object[]]$apps){foreach($a in $apps){if(-not($a.Path.StartsWith($oldRoot+'\',[StringComparison]::OrdinalIgnoreCase) -or $a.Path.StartsWith($oldPacket+'\',[StringComparison]::OrdinalIgnoreCase))){throw 'Unknown ZhiCang app exists; do not install/uninstall or stop it'}}}
function StopOwned([object[]]$apps){AssertOwned $apps;foreach($a in $apps){try{if(-not $a.Process.HasExited -and $a.Process.StartTime.ToUniversalTime() -eq $a.StartUtc){$a.Process.Kill();$null=$a.Process.WaitForExit(10000)}}catch{if(-not $a.Process.HasExited){throw}}}}
function ChildInfo([string]$file,[string]$argumentsText){
 $si=New-Object Diagnostics.ProcessStartInfo;$si.FileName=$file;$si.Arguments=$argumentsText;$si.UseShellExecute=$false;$si.WorkingDirectory=[IO.Path]::GetDirectoryName($file)
 $si.EnvironmentVariables['ZHICANG_USER_DATA_DIR']=$profile;$si.EnvironmentVariables['TEMP']=$temp;$si.EnvironmentVariables['TMP']=$temp
 foreach($k in @('ELECTRON_RUN_AS_NODE','ELECTRON_RENDERER_URL','NODE_OPTIONS','PORTABLE_EXECUTABLE_DIR','PORTABLE_EXECUTABLE_FILE')){$si.EnvironmentVariables.Remove($k)}
 return $si
}
function Status([string]$path){
 $q=[Net.HttpWebRequest]::Create('http://127.0.0.1:38121'+$path);$q.Proxy=$null;$q.Timeout=1500
 try{$a=$q.GetResponse();try{return [int]$a.StatusCode}finally{$a.Dispose()}}catch [Net.WebException]{if($_.Exception.Response){$a=$_.Exception.Response;try{return [int]$a.StatusCode}finally{$a.Dispose()}};throw}
}
function LaunchProbe([string]$label){
 $p=[Diagnostics.Process]::Start((ChildInfo ($install+'\ZhiCang.exe') ''));$ok=$false
 for($i=0;$i -lt 15;$i++){if($p.WaitForExit(1000)){throw ('App exited before readiness: '+$p.ExitCode)};try{if((Status '/api/ping') -eq 200){$ok=$true;break}}catch{}}
 if(-not $ok){throw 'App bridge did not become ready within bounded wait'}
 $client=New-Object Net.WebClient;$client.Proxy=$null
 try{$ping=ConvertFrom-Json ($client.DownloadString('http://127.0.0.1:38121/api/ping'))}finally{$client.Dispose()}
 if(-not $ping.ok -or $ping.version -ne '0.3.1'){throw 'Wrong bridge version or status'}
 $owner=$null;foreach($line in (& ($env:SystemRoot+'\System32\netstat.exe') -ano -p tcp)){if($line -match '^\s*TCP\s+127\.0\.0\.1:38121\s+\S+\s+LISTENING\s+(\d+)\s*$'){$owner=[int]$matches[1]}}
 if(-not $owner){throw 'Cannot prove loopback owner'};$op=[Diagnostics.Process]::GetProcessById($owner)
 if(-not $op.MainModule.FileName.Equals($install+'\ZhiCang.exe',[StringComparison]::OrdinalIgnoreCase)){throw 'Unexpected bridge owner'}
 $unauth=Status '/api/recent';if($unauth -ne 401){throw 'Unauthenticated API must return 401'}
 if(-not [IO.File]::Exists($profile+'\zhicang.db')){throw 'Private SQLite database missing'}
 $results[$label]=[ordered]@{PID=$p.Id;OwnerPID=$owner;Version=$ping.version;Ping=200;UnauthenticatedRecent=$unauth;PrivateSQLiteExists=$true;WindowTitle=$p.MainWindowTitle}
 StopOwned @(AppProcesses)
}
try {
 Note 'START: isolated Setup lifecycle. No GUI interaction, no real account data.'
 if(-not [IO.Directory]::Exists($packet) -or -not [IO.Directory]::Exists($oldRoot)){throw 'Expected existing task roots are missing'}
 if(([IO.File]::GetAttributes($oldRoot) -band [IO.FileAttributes]::ReparsePoint) -ne 0){throw 'Task root is a reparse point'}
 if([IO.Directory]::Exists($root)){throw 'v031 test directory already exists; preserve it and inspect results, do not overwrite'}
 if(@(Registrations).Count){throw 'An installation identity already exists; no installer was run'}
 foreach($s in @([Environment]::GetFolderPath('DesktopDirectory'),[Environment]::GetFolderPath('CommonDesktopDirectory'),([Environment]::GetFolderPath('StartMenu')+'\Programs'),([Environment]::GetFolderPath('CommonStartMenu')+'\Programs'))){if([IO.File]::Exists($s+'\智藏 ZhiCang.lnk') -or [IO.Directory]::Exists($s+'\智藏 ZhiCang')){throw 'Existing ZhiCang shortcut/folder found; preserve it and stop'}}
 if(-not [IO.File]::Exists($exe)){
  $out=[IO.File]::Open($exe,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write)
  try{for($i=1;$i -le 11;$i++){$c=$packet+('\setup031.chunk{0:00}' -f $i);$inputFile=[IO.File]::OpenRead($c);try{$inputFile.CopyTo($out)}finally{$inputFile.Dispose()}}}finally{$out.Dispose()}
 }
 if((Get-FileHash -LiteralPath $exe -Algorithm SHA256).Hash -ne $expected){throw 'Installer SHA256 mismatch; installer not started'}
 $results.SetupSHA256=$expected;Note 'PASS: Setup SHA256 verified.'
 $apps=@(AppProcesses);AssertOwned $apps;StopOwned $apps
 $listener=New-Object Net.Sockets.TcpListener([Net.IPAddress]::Loopback,38121);try{$listener.Start()}finally{$listener.Stop()}
 $null=[IO.Directory]::CreateDirectory($profile);$null=[IO.Directory]::CreateDirectory($temp)
 $p=[Diagnostics.Process]::Start((ChildInfo $exe ('/S /currentuser /D='+$install)))
 if(-not $p.WaitForExit(150000)){throw 'Setup wait timed out; no repeated install and no forced installer termination'}
 $results.SetupExitCode=$p.ExitCode;if($p.ExitCode -ne 0){throw ('Setup failed exit '+$p.ExitCode)}
 if(-not [IO.File]::Exists($install+'\ZhiCang.exe') -or -not [IO.File]::Exists($install+'\Uninstall ZhiCang.exe')){throw 'Installed exe/uninstaller missing'}
 $version=[Diagnostics.FileVersionInfo]::GetVersionInfo($install+'\ZhiCang.exe');if($version.FileMajorPart -ne 0 -or $version.FileMinorPart -ne 3 -or $version.FileBuildPart -ne 1){throw 'Wrong installed version'}
 $reg=@(Registrations);if(-not $reg.Count){throw 'Expected installer registration missing'};foreach($row in $reg){if($row.InstallLocation.TrimEnd('\') -ne $install){throw 'Installer location is not isolated target'}}
 $results.InstalledVersion=$version.ProductVersion;$results.Registrations=$reg;Note 'PASS: real Setup exit0 + files + version + isolated registration.'
 LaunchProbe 'FirstLaunch';LaunchProbe 'Restart';Note 'PASS: two real app launches + private SQLite + owned bridge + unauthenticated401.'
 $reg=@(Registrations);foreach($row in $reg){if($row.InstallLocation.TrimEnd('\') -ne $install){throw 'Uninstall location guard failed'}}
 AssertOwned @(AppProcesses)
 $p=[Diagnostics.Process]::Start((ChildInfo ($install+'\Uninstall ZhiCang.exe') '/S /currentuser'))
 if(-not $p.WaitForExit(60000)){throw 'Uninstaller wait timed out; inspect manually'}
 $results.UninstallExitCode=$p.ExitCode;if($p.ExitCode -ne 0){throw 'Uninstaller failed'}
 for($i=0;$i -lt 10 -and [IO.File]::Exists($install+'\ZhiCang.exe');$i++){[Threading.Thread]::Sleep(500)}
 if([IO.File]::Exists($install+'\ZhiCang.exe') -or @(Registrations).Count){throw 'Uninstall did not remove expected binary/registration'}
 if(-not [IO.File]::Exists($profile+'\zhicang.db')){throw 'Private data was not retained after uninstall'}
 $results.UninstallRetainedPrivateSQLite=$true;$results.Status='PASSED_WITHIN_RECORDED_INFRASTRUCTURE_SCOPE'
 Note 'PASS: isolated uninstall removed app/registration and retained private database. GUI/business workflow still NOT TESTED.'
} catch {$results.Status='FAILED';$results.Error=$_.Exception.Message;Note ('ERROR: '+$results.Error)} finally {
 $results.Finished=[TimeZoneInfo]::ConvertTimeBySystemTimeZoneId([DateTime]::UtcNow,'China Standard Time').ToString('s')
 $json=$results|ConvertTo-Json -Depth 9;[IO.File]::WriteAllText($packet+'\WINDOWS-031-LIFECYCLE.json',$json,(New-Object Text.UTF8Encoding($true)));Note $json
}
if($results.Status -like 'PASSED*'){exit 0}else{exit 1}
