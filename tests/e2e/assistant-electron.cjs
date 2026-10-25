// Runs with normal Playwright clicks/typing against a real Electron host,
// real Harness and isolated files. Only the model endpoint is simulated.
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const assert=require('node:assert/strict');
const {_electron}=require('playwright');
const Model=require('../../src/domain/model.js');

async function main(){
 const {startModel}=await import('../ai/mock-model.mjs');
 const root=path.resolve(__dirname,'../..'),directory=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'calendar-ai-ui-')));
 const output=path.resolve(process.env.CALENDAR_AI_REPORT||path.join(root,'.build/assistant-electron.json'));await fs.mkdir(path.dirname(output),{recursive:true});
 const record={id:'ui-ai-login',title:'登录优化',start:Model.localDate().slice(0,7)+'-07',end:Model.localDate().slice(0,7)+'-11',phases:[{name:'开发',start:Model.localDate().slice(0,7)+'-07',end:Model.localDate().slice(0,7)+'-09'},{name:'验收',start:Model.localDate().slice(0,7)+'-10',end:Model.localDate().slice(0,7)+'-11'}],tasks:['实现登录接口','验收'],note:'需求由对话创建'};
 const model=await startModel([['context',{}],['list',{}],['create',{data:record}],['update',{id:record.id,data:{note:'接口已确认'}}],['shift',{id:record.id,days:2}],['get',{id:record.id}],'已创建登录优化并后移两天，阶段也一起调整。',
   ['delete',{id:record.id}],'尚未授权删除需求，请在设置中开启删除权限。',
   ['delete',{id:record.id}],'已删除测试需求。',{pause:true},'欢迎继续之前的安排，历史已经恢复。']);
 const checks=[],check=(name,value)=>{assert.ok(value,name);checks.push(name);console.log('PASS: '+name);};
 let application,page;
 const api=()=>page.evaluate(()=>CalendarDesktop.postMessage({action:'assistant',request:{method:'state'}}));
 async function launch(){
  const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
  const executablePath=process.env.CALENDAR_ELECTRON_EXE||require('electron');
  const args=process.env.CALENDAR_ELECTRON_EXE?['--calendar-data-dir',directory]:[root,'--calendar-data-dir',directory];
  application=await _electron.launch({executablePath,args,env,timeout:30000});page=await application.firstWindow();page.setDefaultTimeout(12000);
  page.on('pageerror',error=>console.error('Renderer error:',error.message));
  try{await page.waitForSelector('.rf-assistant-toggle');}catch(error){console.error('Page diagnostics:',await page.evaluate(()=>({url:location.href,ready:typeof CalendarReady,app:typeof CalendarApp,text:document.body.innerText.slice(0,1500),scripts:[...document.scripts].map(s=>s.src)})));await page.screenshot({path:path.join(path.dirname(output),'assistant-failure.png')});throw error;}
 }
 async function visibleFit(name){
  const fit=await page.evaluate(()=>{
   const panel=document.querySelector('#rf-assistant').getBoundingClientRect(),composer=document.querySelector('[data-ai=composer]').getBoundingClientRect();
   return {width:innerWidth,height:innerHeight,panel:{left:panel.left,right:panel.right,top:panel.top,bottom:panel.bottom},composer:{bottom:composer.bottom},scrollWidth:document.documentElement.scrollWidth};
  });check(name,fit.panel.left>=0&&fit.panel.right<=fit.width&&fit.panel.right-fit.panel.left>=320&&fit.panel.bottom<=fit.height&&fit.composer.bottom<=fit.panel.bottom&&fit.scrollWidth<=fit.width);
 }
 async function screenshot(name){await page.screenshot({path:path.join(path.dirname(output),'assistant-'+name+'.png')});}
 async function settle(){await page.waitForFunction(async()=>!(await CalendarDesktop.postMessage({action:'assistant',request:{method:'state'}})).busy);await page.locator('[data-ai=stop]').waitFor({state:'hidden'});}
 async function send(text){await page.locator('#rf-ai-input').fill(text);await page.getByRole('button',{name:'发送',exact:true}).click();await page.waitForFunction(()=>document.querySelector('#rf-ai-input').value==='');await settle();}
 try{
  await launch();await page.getByRole('button',{name:'日历助手',exact:true}).click();await page.waitForFunction(()=>document.querySelector('[data-ai=history]').options.length>0);
  await visibleFit('assistant fits the actual launched window before resizing');await screenshot('empty');
  check('initial assistant explains connection and disables sending without a key',await page.locator('[data-ai=setup]').isVisible()&&await page.locator('[data-ai=send]').isDisabled());
  await page.getByRole('button',{name:'设置',exact:true}).click();
  check('only read permission is enabled by default',await page.locator('[data-permission=read]').isChecked()&&!await page.locator('[data-permission=create]').isChecked()&&!await page.locator('[data-permission=delete]').isChecked());
  await page.locator('[data-ai=key]').fill('ui-fixture-key');await page.locator('[data-ai=baseURL]').fill(model.url);await page.locator('[data-ai=preferences]').fill('周五留给验收；大需求先拆阶段。');
  await page.locator('[data-permission=create]').check();await page.locator('[data-permission=update]').check();
  await page.waitForFunction(async()=>{const s=await CalendarDesktop.postMessage({action:'assistant',request:{method:'state'}});return s.settings.permissions.create&&s.settings.permissions.update;});
  await page.locator('[data-ai=apiEnabled]').check();await page.waitForFunction(async()=>(await CalendarDesktop.postMessage({action:'assistant',request:{method:'state'}})).api.enabled);
  await screenshot('settings');await page.getByRole('button',{name:'保存设置',exact:true}).click();await page.waitForSelector('[data-ai=configuration]',{state:'hidden'});
  check('permissions and API switches retain unsaved work habits and provider fields',(await api()).settings.preferences.includes('周五'));
  await send('新建登录优化，备注接口已确认，再整体后移两天。');
  check('chat shows the committed assistant response',await page.locator('.rf-ai-assistant').last().innerText().then(text=>text.includes('已创建登录优化')));
  let stored=JSON.parse(await fs.readFile(path.join(directory,'calendar.json'),'utf8'));
  check('normal chat persists complete requirement and shifted phase dates',stored.requirements[0].id===record.id&&stored.requirements[0].start===Model.add(record.start,2)&&stored.requirements[0].phases[0].start===Model.add(record.start,2)&&stored.requirements[0].note==='接口已确认');
  check('AI writes refresh the calendar bar',await page.locator('[data-requirement-id="ui-ai-login"]').count()>0);
  await screenshot('conversation');
  const state=await api();
  await page.getByRole('button',{name:'打开需求',exact:true}).last().click();await page.getByRole('button',{name:'编辑需求',exact:true}).click();await page.locator('.rf-editor-basics input[type=text]').fill('还没保存的草稿');
  const status=await fetch(state.api.url+'/v1/status',{headers:{Authorization:'Bearer '+state.api.token}}).then(r=>r.json());
  const blocked=await fetch(state.api.url+'/v1/requirements/'+record.id,{method:'PATCH',headers:{Authorization:'Bearer '+state.api.token,'Content-Type':'application/json','If-Match':status.revision},body:JSON.stringify({note:'must-not-save'})});
  check('external AI API cannot overwrite an actual unsaved UI draft',blocked.status===409&&(await blocked.json()).error.code==='DRAFT_DIRTY');
  await page.getByRole('button',{name:'取消',exact:true}).click();if(await page.getByRole('button',{name:'不保存',exact:true}).isVisible())await page.getByRole('button',{name:'不保存',exact:true}).click();
  await page.getByRole('button',{name:'日历助手',exact:true}).click();
  await send('删除刚才创建的测试需求。');
  check('ungranted delete is refused in a real Harness turn',(await api()).messages.some(m=>m.role==='tool'&&m.action==='delete'&&!m.ok)&&JSON.parse(await fs.readFile(path.join(directory,'calendar.json'),'utf8')).requirements.length===1);
  await page.getByRole('button',{name:'设置',exact:true}).click();await page.locator('[data-permission=delete]').check();await page.waitForFunction(async()=>(await CalendarDesktop.postMessage({action:'assistant',request:{method:'state'}})).settings.permissions.delete);await page.getByRole('button',{name:'返回对话',exact:true}).click();
  await send('已经授权，请删除这个测试需求。');check('granting delete permits a persisted removal',JSON.parse(await fs.readFile(path.join(directory,'calendar.json'),'utf8')).requirements.length===0);
  await page.locator('#rf-ai-input').fill('继续帮我想想下周的安排。');await page.getByRole('button',{name:'发送',exact:true}).click();await page.locator('[data-ai=stop]').waitFor({state:'visible'});await page.getByRole('button',{name:'停止',exact:true}).click();await settle();
  check('stop closes the real runtime and leaves a truthful cancellation receipt',(await api()).messages.some(m=>m.status==='cancelled'));
  const prior=(await api()).current;await page.getByRole('button',{name:'新对话',exact:true}).click();await page.waitForFunction(async()=>(await CalendarDesktop.postMessage({action:'assistant',request:{method:'state'}})).messages.length===0);
  check('new conversation starts empty while preserving history',(await api()).conversations.length===2);
  await page.locator('[data-ai=history]').selectOption(prior);await page.waitForFunction(id=>document.querySelector('[data-ai=history]').value===id,prior);
  await application.close();application=null;
  await launch();await page.getByRole('button',{name:'日历助手',exact:true}).click();await page.waitForFunction(()=>document.querySelector('[data-ai=history]').options.length===2);
  const restored=await api();check('restart restores encrypted key, preferences and the selected conversation',restored.hasKey&&restored.settings.preferences.includes('周五')&&restored.current===prior);
  check('local API reuses its saved endpoint across a normal app restart',restored.api.url===state.api.url);
  await send('继续之前的安排。');check('Harness resumes durable history after a cancelled turn and app restart',await page.locator('.rf-ai-assistant').last().innerText().then(text=>text.includes('历史已经恢复'))&&JSON.stringify(model.requests.at(-1)).includes('新建登录优化'));
  check('API key is absent from public state and plain JSON records',!JSON.stringify(await api()).includes('ui-fixture-key')&&!(await fs.readFile(path.join(directory,'assistant/conversations.json'),'utf8')).includes('ui-fixture-key')&&!(await fs.readFile(path.join(directory,'assistant/settings.json'),'utf8')).includes('ui-fixture-key'));
  await application.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setSize(920,600));await page.waitForFunction(()=>innerWidth===920);await visibleFit('assistant and composer fit the minimum 920×600 window');
  await page.waitForFunction(()=>{const messages=document.querySelector('[data-ai=messages]'),last=messages.lastElementChild;return last.getBoundingClientRect().bottom<=messages.getBoundingClientRect().bottom+1;});check('latest reply stays visible after resizing',true);await screenshot('minimum');
  await fs.writeFile(output,JSON.stringify({ok:true,checks,platform:process.platform,model:'local Messages fixture; official Harness runtime'},null,2)+'\n');
 }catch(error){if(page){await screenshot('failure').catch(()=>{});try{const state=await api();console.error('Assistant diagnostics:',{busy:state.busy,error:state.error,reply:state.messages.filter(m=>m.role==='assistant').at(-1),modelRequests:model.requests.length});}catch{}}throw error;
 }finally{
  if(application)await application.close().catch(()=>{});await model.close();await fs.rm(directory,{recursive:true,force:true});
 }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
