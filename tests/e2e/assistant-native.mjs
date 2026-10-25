import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';
import assert from 'node:assert/strict';
import {startModel} from '../ai/mock-model.mjs';
import Model from '../../src/domain/model.js';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const directory=await fs.mkdtemp(path.join(os.tmpdir(),'calendar-native-ai-'));
const start=Model.localDate().slice(0,7)+'-07',end=Model.add(start,4);
const model=await startModel([['context',{}],['create',{data:{id:'native-ai-test',title:'助手排期验证',start,end}}],['update',{id:'native-ai-test',data:{note:'原生桥接保存成功'}}],['shift',{id:'native-ai-test',days:2}],['get',{id:'native-ai-test'}],'已完成排期，日历已经保存。']);
const script=`
const checks=[],check=(ok,name)=>{if(!ok)throw Error(name);checks.push(name);};
const bridge=webkit.messageHandlers.calendar,wait=async predicate=>{for(let i=0;i<300;i++){if(await predicate())return;await new Promise(r=>setTimeout(r,30));}throw Error('等待助手超时');};
await wait(()=>document.querySelector('.rf-assistant-toggle'));
document.querySelector('.rf-assistant-toggle').click();
await wait(()=>document.querySelector('[data-ai=history]').options.length);
document.querySelector('[data-ai=settings]').click();
check(!document.querySelector('[data-ai=configuration]').hidden,'assistant settings open inside the native calendar');
document.querySelector('[data-ai=key]').value='native-fixture-key';
document.querySelector('[data-ai=baseURL]').value=${JSON.stringify(model.url)};
document.querySelector('[data-ai=preferences]').value='周五预留给验收';
for(const name of ['create','update']){document.querySelector('[data-permission='+name+']').click();await wait(async()=>{const s=await bridge.postMessage({action:'assistant',request:{method:'state'}});return s.settings.permissions[name];});}
document.querySelector('[data-ai=configuration]').requestSubmit();
await wait(()=>document.querySelector('[data-ai=configuration]').hidden);
check(document.querySelector('[data-ai=key]').value==='','saved API key is removed from the form');
document.querySelector('#rf-ai-input').value='创建测试需求，修改备注并把排期后移两天。';
document.querySelector('[data-ai=composer]').requestSubmit();
await wait(()=>document.querySelector('.rf-ai-assistant p')?.textContent.includes('已完成排期'));
const snapshot=JSON.parse(CalendarApp.exportSnapshot()),item=snapshot.requirements.find(item=>item.id==='native-ai-test');
check(item?.note==='原生桥接保存成功'&&item.start===${JSON.stringify(Model.add(start,2))}&&item.end===${JSON.stringify(Model.add(end,2))},'real Harness CRUD reaches the actual native WebView and persistence bridge');
check(document.querySelector('.rf-bar[data-requirement-id="native-ai-test"]'),'AI creation refreshes the rendered native calendar');
check(document.querySelectorAll('.rf-ai-tool').length===4,'native conversation exposes actual operation receipts');
check(document.querySelector('[data-ai=stop]').hidden,'completed native turn restores the send action');
const panel=document.querySelector('#rf-assistant').getBoundingClientRect(),composer=document.querySelector('[data-ai=composer]').getBoundingClientRect();
check(panel.bottom<=innerHeight&&composer.bottom<=panel.bottom,'native assistant and composer fit in the launched window');
return {checks};`;
await fs.writeFile(path.join(directory,'verify.js'),script);
const output=path.join(root,'.build/assistant-native.json');
const screenshot=path.join(root,'.build/assistant-native.png');
try{
 const app=path.join(root,'dist/需求日历.app/Contents/MacOS/RequirementCalendar');
 const child=spawn(app,[],{env:{...process.env,CALENDAR_VERIFY_SCRIPT:path.join(directory,'verify.js'),CALENDAR_VERIFY_OUTPUT:output,CALENDAR_VERIFY_SNAPSHOT:screenshot,CALENDAR_DATA_DIR:path.join(directory,'data'),CALENDAR_VERIFY_EMPTY:'1'},stdio:['ignore','pipe','pipe']});
 let logs='';child.stderr.on('data',data=>{logs+=data;});
 const code=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',resolve);});
 const report=JSON.parse(await fs.readFile(output,'utf8'));assert.equal(code,0,JSON.stringify(report)+'\n'+logs);assert.equal(report.ok,true,JSON.stringify(report));
 assert.equal(JSON.parse(await fs.readFile(path.join(directory,'data/calendar.json'),'utf8')).requirements[0].note,'原生桥接保存成功');
 console.log(JSON.stringify(report,null,2));console.log('Native screenshot: '+screenshot);
}finally{await model.close();await fs.rm(directory,{recursive:true,force:true});}
