'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {DataStore,decode}=require('../../desktop/electron/data-store.cjs');
const {plans,Reminders}=require('../../desktop/electron/reminders.cjs');
const {requirementURL,requirementID,externalURL,trustedSender,ENTRY}=require('../../desktop/electron/policy.cjs');
const {publicAddress,iconOrigin}=require('../../desktop/electron/site-icons.cjs');
const item={id:'需求-1',title:'支付改版',tone:'blue',start:'2026-10-07',end:'2026-10-14',phases:[],resources:[],tasks:[],done:[],note:'  保留缩进\n'};
const snapshot=(changes={})=>({version:6,anchor:'2026-10-07',requirements:[{...item,...changes}]});
async function fixture(t){const dir=await fs.mkdtemp(path.join(os.tmpdir(),'calendar-unit-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));return new DataStore(dir);}
test('desktop: atomic commits survive reopening, preserve prior backup and whitespace',async t=>{
  const store=await fixture(t);assert.deepEqual(await store.load(),{raw:null,issue:null});
  await store.save(JSON.stringify(snapshot()));await store.save(JSON.stringify(snapshot({title:'更新'})));
  const loaded=await new DataStore(store.directory).load();assert.equal(decode(loaded.raw).requirements[0].title,'更新');
  assert.equal(decode(loaded.raw).requirements[0].note,item.note);
  assert.equal(decode(await fs.readFile(store.backup,'utf8')).requirements[0].title,item.title);
  assert.equal((await fs.readdir(store.directory)).some(name=>name.endsWith('.tmp')),false);
});
test('desktop: corrupt primary recovers backup, next commit archives original bytes',async t=>{
  const store=await fixture(t);await fs.writeFile(store.file,'{broken');await fs.writeFile(store.backup,JSON.stringify(snapshot()));
  assert.match((await store.load()).issue,/恢复/);await store.save(JSON.stringify(snapshot()));
  const preserved=(await fs.readdir(store.directory)).find(name=>name.startsWith('calendar.preserved-'));
  assert.equal(await fs.readFile(path.join(store.directory,preserved),'utf8'),'{broken');
});
test('desktop: unreadable and future records block ordinary saves; explicit restore archives data',async t=>{
  const store=await fixture(t);const original=JSON.stringify({...snapshot(),version:999});await fs.writeFile(store.file,original);
  assert.equal((await store.load()).raw,null);await assert.rejects(store.save(JSON.stringify(snapshot())),/恢复/);
  await store.save(JSON.stringify(snapshot()),true);
  const preserved=(await fs.readdir(store.directory)).find(name=>name.startsWith('calendar.preserved-'));
  assert.equal(await fs.readFile(path.join(store.directory,preserved),'utf8'),original);
});
test('desktop: external edits reject stale writer; failed atomic write keeps committed data',async t=>{
  const store=await fixture(t);await store.load();await store.save(JSON.stringify(snapshot()));
  const other=JSON.stringify(snapshot({title:'外部修改'}));await fs.writeFile(store.file,other);
  await assert.rejects(store.save(JSON.stringify(snapshot())),/其他程序/);assert.equal(await fs.readFile(store.file,'utf8'),other);
  await store.load();const atomic=store.atomic.bind(store);store.atomic=async(file,raw)=>{if(file===store.file)throw new Error('disk full');return atomic(file,raw);};
  await assert.rejects(store.save(JSON.stringify(snapshot())),/disk full/);assert.equal(await fs.readFile(store.file,'utf8'),other);
});
test('desktop: malformed imports and simultaneous commits cannot bypass validation',async t=>{
  const store=await fixture(t);await store.load();await assert.rejects(store.save('{bad'));
  await Promise.all([store.save(JSON.stringify(snapshot())),store.save(JSON.stringify(snapshot({title:'第二次保存'})))]);
  assert.equal(decode(await fs.readFile(store.file,'utf8')).requirements[0].title,'第二次保存');
});
test('desktop: only trusted main frame may invoke native capabilities',()=>{
  const frame={url:ENTRY},contents={mainFrame:frame},window={isDestroyed:()=>false,webContents:contents};
  assert.equal(trustedSender({sender:contents,senderFrame:frame},window),true);
  assert.equal(trustedSender({sender:contents,senderFrame:{url:ENTRY}},window),false);
  frame.url='https://example.com';assert.equal(trustedSender({sender:contents,senderFrame:frame},window),false);
});
test('desktop: toast links roundtrip Unicode IDs and reject arbitrary protocols/paths',()=>{
  assert.equal(requirementID(requirementURL(item.id)),item.id);
  for(const url of ['https://requirement/abc','requirement-calendar://other/a','requirement-calendar://requirement/a?x=1','requirement-calendar://requirement/a%2fb','requirement-calendar://requirement/%00'])assert.equal(requirementID(url),null);
  for(const url of ['file:///etc/passwd','javascript:alert(1)','https://u:p@example.com'])assert.equal(externalURL(url),null);
});
test('desktop: reminders retain stable short IDs, local timezone and title safely as data',()=>{
  const next=snapshot({reminder:'2099-10-09T10:30',title:'<xml> & " 引号'}),first=plans(next,0)[0];
  assert.match(first.id,/^rc[0-9a-f]{14}$/);assert.equal(first.title,next.requirements[0].title);
  assert.equal(first.due,new Date(next.requirements[0].reminder).toISOString());
  assert.equal(plans({...next,requirements:[{...next.requirements[0],title:'改标题'}]},0)[0].id,first.id);
  assert.deepEqual(plans(next,Date.parse('2100-01-01')),[]);assert.deepEqual(plans(snapshot(),0),[]);
});
test('desktop: serialized reminder reconciliation ends with newest state including cancellation',async()=>{
  let release;const gate=new Promise(resolve=>{release=resolve;}),calls=[],issues=[];
  const service=new Reminders({enabled:true,script:'fixed.ps1',run:async(_script,input)=>{calls.push(input);if(calls.length===1)await gate;},onIssue:issue=>issues.push(issue)});
  const first=service.reconcile(snapshot({reminder:'2099-10-09T10:30'}));await new Promise(resolve=>setImmediate(resolve));
  const second=service.reconcile(snapshot({reminder:'2099-10-10T10:30'}));const cancel=service.reconcile({version:6,anchor:'2026-10-07',requirements:[]});release();
  await Promise.all([first,second,cancel]);assert.equal(calls.length,2);assert.deepEqual(calls[1].plans,[]);assert.deepEqual(issues,[null]);
});
test('desktop: reminder failures report separately from already saved requirements',async()=>{
  const issues=[],service=new Reminders({enabled:true,script:'fixed',run:async()=>{throw new Error('通知已禁用');},onIssue:issue=>issues.push(issue)});
  await service.reconcile(snapshot({reminder:'2099-10-09T10:30'}));assert.match(issues[0],/需求已保存；通知已禁用/);
});
test('desktop: icon fetch accepts public origins, excludes credentials, private IPs and document paths',()=>{
  for(const raw of ['https://127.0.0.1','https://10.1.2.3','https://169.254.169.254','https://localhost','https://foo.local','https://user:pass@example.com','http://example.com','https://example.com/document/private','https://example.com:8443'])assert.equal(iconOrigin(raw),null);
  assert.ok(iconOrigin('https://example.com'));assert.equal(publicAddress('::1'),false);assert.equal(publicAddress('::ffff:127.0.0.1'),false);assert.equal(publicAddress('172.20.1.1'),false);assert.equal(publicAddress('8.8.8.8'),true);
});
