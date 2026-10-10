'use strict';
const {app,BrowserWindow,Menu,dialog,ipcMain,protocol,session,shell,nativeImage,powerMonitor}=require('electron');
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const {DataStore,decode,LIMIT}=require('./data-store.cjs');
const {ENTRY,externalURL,requirementID,trustedSender}=require('./policy.cjs');
const {APP_ID,TOAST_CLSID,Reminders}=require('./reminders.cjs');
const {fetchIcon}=require('./site-icons.cjs');
const smoke=process.argv.includes('--calendar-smoke-test');
const root=path.resolve(__dirname,'../..');
let window,store,reminders,ready=false,closing=false,closePrompt=false,notificationID=null,reminderIssue=null;
let smokeDirectory,smokeStarted=false;
app.setName('RequirementCalendar');
app.setAppUserModelId(APP_ID);
protocol.registerSchemesAsPrivileged([{scheme:'calendar-app',privileges:{standard:true,secure:true,supportFetchAPI:true}}]);
if(smoke){smokeDirectory=require('node:fs').mkdtempSync(path.join(os.tmpdir(),'requirement-calendar-smoke-'));app.setPath('userData',smokeDirectory);}
if(!app.requestSingleInstanceLock())app.quit();
else {
  const receive=args=>{for(const arg of args){const id=requirementID(arg);if(id){notificationID=id;deliverNotification();break;}}};
  receive(process.argv);
  app.on('second-instance',(_event,args)=>{receive(args);if(window){if(window.isMinimized())window.restore();window.show();window.focus();}});
  app.on('open-url',(event,url)=>{event.preventDefault();receive([url]);});
  app.whenReady().then(start).catch(error=>{console.error(error);app.exit(1);});
  app.on('window-all-closed',()=>app.quit());
  app.on('before-quit',event=>{if(window&&!window.isDestroyed()&&!closing){event.preventDefault();window.close();}});
}
async function invoke(method,...args) {
  if(!window||window.isDestroyed()||!ready)return false;
  if(!['command','openRequirement','editRequirement','deleteRequirement','hasUnsavedChanges','isSaving','exportSnapshot','exportJSON','executeCommand','restoreSnapshot','refreshDate','setReminderIssue'].includes(method))throw new Error('Invalid UI method');
  return window.webContents.executeJavaScript(`window.CalendarReady.then(()=>window.CalendarApp[${JSON.stringify(method)}](...${JSON.stringify(args)}))`);
}
function report(error) { if(window&&!window.isDestroyed())dialog.showMessageBox(window,{type:'error',title:'需求日历',message:error.message||String(error)}); }
function act(method,...args){void invoke(method,...args).catch(report);}
async function deliverNotification() {
  if(ready&&notificationID){const id=notificationID;notificationID=null;await invoke('openRequirement',id);}
}
async function confirmSaved() {
  if(!ready)return false;
  if(await invoke('isSaving'))return false;
  if(!await invoke('hasUnsavedChanges'))return true;
  const {response}=await dialog.showMessageBox(window,{type:'question',title:'保存更改',message:'保存对需求的更改？',detail:'未保存的更改会在离开编辑器后丢失。',buttons:['保存','不保存','继续编辑'],defaultId:0,cancelId:2,noLink:true});
  if(response===1){await invoke('command','discard');return true;}
  if(response!==0)return false;
  await invoke('command','save');return !await invoke('hasUnsavedChanges');
}
async function exportJSON(scope='all') {
  if(!['all','summary'].includes(scope))throw Error('导出范围无效。');
  const raw=await invoke('exportJSON',scope);decode(raw);
  const selected=smoke?{canceled:false,filePath:path.join(smokeDirectory,'requirements.json')}:await dialog.showSaveDialog(window,{title:'导出需求 JSON',defaultPath:'需求日历.json',filters:[{name:'JSON',extensions:['json']}]});
  if(selected.canceled||!selected.filePath)return {saved:false};
  await store.atomic(selected.filePath,raw);return {saved:true,bytes:Buffer.byteLength(raw)};
}
async function pickJSON() {
  const {canceled,filePaths}=await dialog.showOpenDialog(window,{title:'导入需求 JSON',properties:['openFile'],filters:[{name:'JSON',extensions:['json']}]});
  if(canceled)return {raw:null};
  if((await fs.stat(filePaths[0])).size>LIMIT)throw Error('JSON 文件不能超过 16 MB。');
  return {raw:await fs.readFile(filePaths[0],'utf8')};
}
function menu() {
  const safe=fn=>()=>{void fn().catch(report);};
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    {label:'文件',submenu:[
      {label:'新建需求',accelerator:'CmdOrCtrl+N',click:()=>act('command','new')},
      {label:'保存需求',accelerator:'CmdOrCtrl+S',click:()=>act('command','save')},
      {label:'关闭详情',accelerator:'CmdOrCtrl+W',click:()=>act('command','close')},{type:'separator'},
      {label:'导入需求 JSON…',click:()=>act('command','importJSON')},
      {label:'导出需求 JSON…',click:safe(()=>exportJSON())},
      {label:'打开数据文件夹',click:safe(async()=>{const issue=await shell.openPath(store.directory);if(issue)throw new Error(issue);})},
      {type:'separator'},{label:'退出',accelerator:'Alt+F4',click:()=>window.close()}
    ]},
    {label:'编辑',submenu:[
      {label:'撤销',accelerator:'CmdOrCtrl+Z',click:async()=>{if(!await invoke('command','undo'))window.webContents.undo();}},
      {role:'redo',label:'重做'},{type:'separator'},{role:'cut',label:'剪切'},{role:'copy',label:'复制'},{role:'paste',label:'粘贴'},{role:'selectAll',label:'全选'}
    ]},
    {label:'视图',submenu:[
      {label:'月历 / 需求汇总',click:()=>act('command','summary')},
      {label:'上个月',accelerator:'CmdOrCtrl+Alt+Left',click:()=>act('command','previous')},
      {label:'下个月',accelerator:'CmdOrCtrl+Alt+Right',click:()=>act('command','next')},{role:'togglefullscreen',label:'全屏'}
    ]}
  ]));
}
function installWindowsIdentity() {
  if(process.platform!=='win32'||!app.isPackaged||smoke)return false;
  const shortcut=path.join(app.getPath('appData'),'Microsoft','Windows','Start Menu','Programs','需求日历.lnk');
  const ok=shell.writeShortcutLink(shortcut,'create',{target:process.execPath,description:'需求排期、阶段与资料',appUserModelId:APP_ID,toastActivatorClsid:TOAST_CLSID});
  return ok&&app.setAsDefaultProtocolClient('requirement-calendar');
}
async function start() {
  store=new DataStore(path.join(app.getPath('userData'),'data'));
  const identity=installWindowsIdentity();
  reminders=new Reminders({enabled:identity,script:app.isPackaged?path.join(process.resourcesPath,'windows-reminders.ps1'):path.join(__dirname,'windows-reminders.ps1'),
    onIssue(issue){
      reminderIssue=issue;
      if(ready)void window.webContents.executeJavaScript(`(async()=>{await window.CalendarReady;while(window.CalendarApp.isSaving())await new Promise(resolve=>setTimeout(resolve,20));window.CalendarApp.setReminderIssue(${JSON.stringify(issue)});})()`).catch(()=>{});
    }});
  const assets=new Set(["index.html","src/main.js","src/styles/main.css","src/domain/model.js","src/domain/planning.js","src/domain/commands.js","src/services/storage.js","src/services/site-icons.js","src/components/elements.js","src/components/icons.js","src/components/disclosure.js","src/components/startup.js"]);
  protocol.handle('calendar-app',async request=>{
    const url=new URL(request.url),file=url.pathname.slice(1);
    if(url.protocol!=='calendar-app:'||url.hostname!=='local'||url.port||url.username||url.password||!assets.has(file)||url.search||request.method!=='GET')return new Response('',{status:404});
    const content=await fs.readFile(path.join(root,file));
    const type=file.endsWith('.html')?'text/html':file.endsWith('.css')?'text/css':'text/javascript';
    return new Response(content,{headers:{'Content-Type':type+'; charset=utf-8','Content-Security-Policy':"default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-src 'none'"}});
  });
  session.defaultSession.setPermissionRequestHandler((_contents,_permission,callback)=>callback(false));
  session.defaultSession.setPermissionCheckHandler(()=>false);
  window=new BrowserWindow({width:1160,height:780,minWidth:920,minHeight:600,show:false,backgroundColor:'#f4f7ff',title:'需求日历',icon:path.join(root,'assets','app-icon.png'),
    webPreferences:{preload:path.join(__dirname,'preload.cjs'),nodeIntegration:false,contextIsolation:true,sandbox:true,webSecurity:true,spellcheck:false,devTools:!app.isPackaged}});
  menu();
  if(smoke)window.webContents.on('console-message',event=>console.log('renderer:',event.message));
  window.webContents.on('will-attach-webview',event=>event.preventDefault());
  window.webContents.on('will-navigate',(event,url)=>{if(url===ENTRY)return;event.preventDefault();const link=externalURL(url);if(link)void shell.openExternal(link).catch(report);});
  window.webContents.setWindowOpenHandler(({url})=>{const link=externalURL(url);if(link)void shell.openExternal(link).catch(report);return {action:'deny'};});
  window.on('close',event=>{
    if(closing)return;event.preventDefault();if(closePrompt)return;closePrompt=true;
    void confirmSaved().then(async ok=>{
      if(!ok)return;
      await reminders.tail;
      if(await invoke('hasUnsavedChanges'))return;
      closing=true;window.close();
    }).catch(report).finally(()=>{closePrompt=false;});
  });
  window.webContents.on('did-finish-load',async()=>{
    try {
      await window.webContents.executeJavaScript("document.documentElement.classList.add('native'); window.CalendarReady");
      ready=true;await invoke('setReminderIssue',reminderIssue);await deliverNotification();
      if(smoke&&!smokeStarted){smokeStarted=true;await require('./smoke.cjs').run({app,window,store,invoke,directory:smokeDirectory});closing=true;app.exit(0);}
      else if(!smoke)window.show();
    } catch(error){if(smoke){console.error(error);app.exit(1);}else report(error);}
  });
  ipcMain.handle('calendar:request',async(event,message)=>{
    if(!trustedSender(event,window))throw new Error('拒绝不可信页面。');
    if(!message||typeof message!=='object')throw new Error('无效的桌面请求。');
    switch(message.action) {
      case 'load': {
        const result=await store.load();if(result.raw)void reminders.reconcile(decode(result.raw));return result;
      }
      case 'save': {
        const data=await store.save(message.raw,message.recovery===true);
        void reminders.reconcile(data);
        return {reminderIssue:'需求已保存，正在确认系统提醒状态…'};
      }
      case 'exportJSON':return await exportJSON(message.scope??'all');
      case 'pickJSON':return await pickJSON();
      case 'resourceIcon':return typeof message.url==='string'?await fetchIcon(message.url,nativeImage):null;
      case 'contextMenu': {
        if(typeof message.id!=='string'||message.id.length>256)throw new Error('无效的需求标识。');
        const items=decode(await invoke('exportSnapshot')).requirements;if(!items.some(item=>item.id===message.id))return;
        Menu.buildFromTemplate([{label:'打开需求',click:()=>act('openRequirement',message.id)},{label:'编辑需求',click:()=>act('editRequirement',message.id)},{type:'separator'},{label:'删除需求',click:()=>act('deleteRequirement',message.id)}]).popup({window});return null;
      }
      default:throw new Error('不支持的桌面请求。');
    }
  });
  powerMonitor.on('resume',()=>{act('refreshDate');void store.tail.then(()=>{if(store.observed)void reminders.reconcile(decode(store.observed));});});
  window.on('focus',()=>{if(ready)act('refreshDate');});
  await window.loadURL(ENTRY);
}
