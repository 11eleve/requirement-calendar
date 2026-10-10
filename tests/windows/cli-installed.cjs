'use strict';
// Runs only against an isolated data directory and the explicitly supplied app.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const {promisify} = require('node:util');
const {execFile} = require('node:child_process');
const execute = promisify(execFile);

async function run() {
  assert.equal(process.platform,'win32');
  const app = path.resolve(process.argv[2]),executable = path.join(path.dirname(app),'reqcal.exe');
  const directory = await fs.mkdtemp(path.join(os.tmpdir(),'reqcal-安装 空格-'));
  const checks=[],check=(name,value)=>{assert.ok(value,name);checks.push(name);};
  async function call(args,expected=0,stdin) {
    let result;
    try {
      const operation=execute(executable,[...args,'--data-dir',directory],{encoding:'utf8',windowsHide:true,maxBuffer:70*1024*1024,timeout:40000});
      if(stdin!==undefined)operation.child.stdin.end(stdin);
      result=await operation;
    } catch(error) {result=error;}
    assert.equal(typeof result.code==='number'?result.code:0,expected,JSON.stringify(args)+'\n'+result.stdout+'\n'+result.stderr);
    return JSON.parse(result.stdout.replace(/^\uFEFF/,''));
  }
  const env={...process.env,REQCAL_TEST_APP:app,REQCAL_TEST_DATA:directory};
  async function processes() {
    const {stdout}=await execute('powershell.exe',['-NoProfile','-NonInteractive','-Command',
      "$items=@(Get-CimInstance Win32_Process | Where-Object { $_.ExecutablePath -ieq $env:REQCAL_TEST_APP -and $_.CommandLine -and $_.CommandLine.Contains($env:REQCAL_TEST_DATA) } | ForEach-Object { $_.ProcessId }); ConvertTo-Json -Compress -InputObject $items"],{env,encoding:'utf8',windowsHide:true});
    return JSON.parse(stdout);
  }
  async function stop() {
    for(const pid of await processes()) {try{process.kill(pid);}catch(error){if(error.code!=='ESRCH')throw error;}}
    for(let i=0;i<100;i++){try{const response=await call(['status','--no-launch'],4);if(response.error.code==='APP_NOT_RUNNING')return;}catch{ }await new Promise(resolve=>setTimeout(resolve,50));}
    throw Error('Isolated application did not stop');
  }
  try {
    check('no-launch reports a missing app with exit code 4',(await call(['status','--no-launch'],4)).error.code==='APP_NOT_RUNNING');
    check('installed reqcal auto-launches its sibling GUI app in the background',(await call(['status'])).ok);
    check('only the isolated application process was launched',(await processes()).length===1);
    const item={id:'installed-cli',title:'安装后的命令行',start:'2026-10-12',end:'2026-10-16',note:'中文\n"quoted" \\path `literal`'};
    const created=await call(['create','--file','-'],0,JSON.stringify(item));
    check('UTF-8 JSON stdin reaches persisted application data',created.data.note===item.note&&created.dataFile===path.join(directory,'calendar.json'));
    check('installed command refuses stale revisions',(await call(['delete',item.id,'--if-revision','stale'],3)).error.code==='REVISION_CONFLICT');
    const endpoint=JSON.parse((await execute(executable,['--endpoint',directory],{encoding:'utf8',windowsHide:true})).stdout).pipe;
    const acl=await execute('powershell.exe',['-NoProfile','-NonInteractive','-Command',
      "$pipe=New-Object System.IO.Pipes.NamedPipeClientStream('.', $env:REQCAL_TEST_PIPE, [IO.Pipes.PipeDirection]::InOut); try { $pipe.Connect(5000); $acl=$pipe.GetAccessControl(); $sid=[Security.Principal.WindowsIdentity]::GetCurrent().User.Value; $rules=@($acl.GetAccessRules($true,$true,[Security.Principal.SecurityIdentifier])); if(!$acl.AreAccessRulesProtected -or $acl.GetOwner([Security.Principal.SecurityIdentifier]).Value -ne $sid) { throw 'Pipe owner or inheritance is incorrect' }; $allow=@($rules|Where-Object {$_.AccessControlType -eq 'Allow'}); $deny=@($rules|Where-Object {$_.AccessControlType -eq 'Deny' -and $_.IdentityReference.Value -eq 'S-1-5-2'}); if($allow.Count -ne 1 -or $allow[0].IdentityReference.Value -ne $sid -or $deny.Count -ne 1){throw 'Pipe ACL is not current-user/local-only'}; 'ok' } finally { $pipe.Dispose() }"],{env:{...env,REQCAL_TEST_PIPE:endpoint},encoding:'utf8',windowsHide:true,timeout:15000});
    check('installed pipe has a protected current-user ACL and rejects network identities',acl.stdout.trim()==='ok');
    check('closing a pipe without a request leaves the server usable',(await call(['status'])).ok);
    await stop();
    check('restarting through reqcal reloads the actual JSON data',(await call(['get',item.id])).data.note===item.note);
    const after=(await call(['status'])).revision;
    check('successful version-checked update persists immediately',(await call(['update',item.id,'--json','{"note":"restarted"}','--if-revision',after])).ok&&JSON.parse(await fs.readFile(path.join(directory,'calendar.json'),'utf8')).requirements[0].note==='restarted');
    const exported=path.join(directory,'导出 空格.json');
    check('installed CLI exports to paths containing spaces and Chinese',(await call(['export','--output',exported])).ok&&JSON.parse(await fs.readFile(exported,'utf8')).requirements.length===1);
    await call(['export','--output',exported]);
    check('export atomically replaces an existing destination',JSON.parse(await fs.readFile(exported,'utf8')).requirements[0].id===item.id);
    check('CLI deletion persists',(await call(['delete',item.id])).ok&&(await call(['list'])).data.length===0);
    const result={ok:true,checks};
    await fs.writeFile(path.resolve(process.env.CALENDAR_CLI_REPORT||'installed-cli-windows.json'),JSON.stringify(result,null,2)+'\n');
    console.log(JSON.stringify(result,null,2));
  } finally { await stop(); await fs.rm(directory,{recursive:true,force:true}); }
}
run().catch(error=>{console.error(error);process.exitCode=1;});
