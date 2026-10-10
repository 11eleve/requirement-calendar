'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const net = require('node:net');
const {promisify} = require('node:util');
const execute = promisify(require('node:child_process').execFile);

async function cli(executable,directory,args,expected=0) {
  let result;
  try { result = await execute(executable,[...args,'--data-dir',directory,'--no-launch'],{encoding:'utf8',windowsHide:true,maxBuffer:70*1024*1024,timeout:35000}); }
  catch (error) { result = error; }
  assert.equal(typeof result.code==='number'?result.code:0,expected,'CLI exit: '+JSON.stringify(args)+'\n'+result.stdout+'\n'+result.stderr);
  return JSON.parse(result.stdout.replace(/^\uFEFF/,''));
}
async function raw(pipe,message) {
  return new Promise((resolve,reject) => {
    const socket = net.createConnection('\\\\.\\pipe\\'+pipe),chunks=[];
    socket.setTimeout(30000,()=>socket.destroy(Error('pipe timeout')));
    socket.on('error',reject);
    socket.on('connect',()=>socket.write(message+'\n'));
    socket.on('data',data=>{chunks.push(data);const text=Buffer.concat(chunks).toString('utf8'),end=text.indexOf('\n');if(end>=0){socket.destroy();try{resolve(JSON.parse(text.slice(0,end)));}catch(error){reject(error);}}});
  });
}
async function run({executable,directory,window,invoke,broker}) {
  const checks=[],check=(name,value)=>{assert.ok(value,name);checks.push(name);};
  const call=(args,expected)=>cli(executable,directory,args,expected);
  const jsonFile=path.join(directory,'cli-中文.json');
  check('Windows native CLI schema shares the application command contract',(await call(['schema'])).data.commands.includes('preview-import'));
  const record={id:'windows-cli',title:'命令行需求',start:'2026-10-12',end:'2026-10-16',note:'  中文\n$(literal) `code` "quote"\\path'+'😀中文\n'.repeat(3000),phases:[{name:'开发',start:'2026-10-12',end:'2026-10-14'}],tasks:['验收'],done:[false],milestones:[{name:'发布',date:'2026-10-16'}]};
  await fs.writeFile(jsonFile,JSON.stringify(record));
  const created=await call(['create','--file',jsonFile]);
  check('real reqcal.exe creates a record through the live named pipe',created.ok&&created.changed&&created.data.note===record.note);
  check('CLI response identifies the real persisted data file',created.dataFile===path.join(directory,'calendar.json'));
  check('CLI creation refreshes the rendered calendar',await window.webContents.executeJavaScript("JSON.parse(CalendarApp.exportSnapshot()).requirements.some(item=>item.id==='windows-cli')"));
  check('create preserves literal Unicode and program text on disk',JSON.parse(await fs.readFile(created.dataFile,'utf8')).requirements.some(item=>item.id===record.id&&item.note===record.note));
  check('CLI filters use actual saved requirements',(await call(['list','--query','命令行需求'])).data.length===1);
  check('native CLI validates JSON before dispatch',(await call(['create','--json','{bad'],2)).error.code==='INVALID_JSON');
  check('native CLI rejects unknown options',(await call(['status','--output','bad'],2)).error.code==='INVALID_ARGUMENT');
  check('stale revisions return conflict and exit code 3',(await call(['update',record.id,'--json','{"note":"stale"}','--if-revision',created.revision+':stale'],3)).error.code==='REVISION_CONFLICT');
  await invoke('editRequirement',record.id);
  await window.webContents.executeJavaScript("(()=>{const field=document.querySelector('input[aria-label=\"需求名称\"]')||document.querySelector('.rf-form input');field.value+=' 草稿';field.dispatchEvent(new Event('input',{bubbles:true}));})()");
  check('named-pipe mutations cannot overwrite unsaved UI drafts',(await call(['update',record.id,'--json','{"note":"blocked"}'],3)).error.code==='DRAFT_DIRTY');
  await invoke('command','discard');
  const before=(await call(['status'])).revision;
  check('native update succeeds with the observed revision',(await call(['update',record.id,'--json','{"note":"接口已确认"}','--if-revision',before])).ok);
  const shifted=await call(['shift',record.id,'--days','3']);
  check('whole-plan shifts move phases and nodes together',shifted.data.start==='2026-10-15'&&shifted.data.phases[0].start==='2026-10-15'&&shifted.data.milestones[0].date==='2026-10-19');
  const exportFile=path.join(directory,'cli-backup.json');
  check('native export produces a directly importable backup',(await call(['export','--output',exportFile])).ok&&JSON.parse(await fs.readFile(exportFile,'utf8')).version===7);
  const preview=await call(['preview-import',exportFile]);
  check('import preview is read-only and reports duplicate identities',preview.ok&&!preview.changed&&preview.data.skipped>=1);
  check('replace import requires an observed revision',(await call(['import',exportFile,'--mode','replace'],2)).error.code==='INVALID_ARGUMENT');
  const revision=(await call(['status'])).revision;
  check('replace import uses the protected archival path',(await call(['import',exportFile,'--mode','replace','--if-revision',revision])).ok);
  check('CLI writes preserve the previous valid snapshot',(await fs.readdir(directory)).includes('calendar.last-good.json'));
  // The snapshot is identical after export/import; force a changed replacement for archival.
  await call(['delete',record.id]);
  await call(['import',exportFile,'--mode','replace','--if-revision',(await call(['status'])).revision]);
  check('changed replacements create independent before-restore archives',(await fs.readdir(directory)).some(name=>name.startsWith('calendar.preserved-')));
  check('malformed pipe JSON is rejected without closing the service',(await raw(broker.pipe,'not-json')).error.code==='INVALID_JSON'&&(await call(['status'])).ok);
  check('the transport cannot execute arbitrary code',(await raw(broker.pipe,JSON.stringify({action:'eval',script:'bad'}))).error.code==='UNKNOWN_COMMAND');
  check('native get returns committed values',(await call(['get',record.id])).data.note==='接口已确认');
  check('native delete targets one record',(await call(['delete',record.id])).data.deleted&&!(await call(['list'])).data.some(item=>item.id===record.id));
  return checks;
}
module.exports={run,cli,raw};
