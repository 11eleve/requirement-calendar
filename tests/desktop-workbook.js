const checks=[],$=s=>document.querySelector(s),$$=s=>Array.from(document.querySelectorAll(s)),assert=(value,message)=>{if(!value)throw Error(message);checks.push(message);};
const settle=async()=>{document.getAnimations().forEach(a=>a.finish());await new Promise(r=>setTimeout(r,80));document.getAnimations().forEach(a=>a.finish());};
const item={id:'excel-native',title:'Excel 原生导出检查',tone:'amber',start:'2026-10-01',end:'2026-10-31',phases:[{name:'开发',start:'2026-10-01',end:'2026-10-20'}],milestones:[{id:'deadline',name:'验收节点',date:'2026-10-25',kind:'deadline',done:false}],resources:[],tasks:['核对时间节点'],done:[false],note:'    原样保留\n'};
assert(await CalendarApp.restoreSnapshot(JSON.stringify({version:7,anchor:'2026-10-01',requirements:[item]})),'workbook fixture saves through the real native bridge');await settle();
const raw=CalendarApp.exportSnapshot(),all=CalendarApp.exportWorkbook();assert(all.name.endsWith('.xlsx')&&atob(all.base64).startsWith('PK')&&all.counts[0].rows===1&&all.counts[1].rows===1,'product renderer generates a real workbook containing requirements and nodes');
const exported=await webkit.messageHandlers.calendar.postMessage({action:'exportExcel',scope:'all'});assert(exported.saved&&exported.bytes>1000,'macOS export bridge writes the generated workbook atomically to its isolated test destination');
let rejected=false;try{await webkit.messageHandlers.calendar.postMessage({action:'exportExcel',scope:'arbitrary'});}catch{rejected=true;}assert(rejected,'native export rejects unknown scopes');
$('#rf-view').click();await settle();const search=$('[data-summary-control=query]');search.value='没有匹配';search.dispatchEvent(new Event('input',{bubbles:true}));await settle();
assert(CalendarApp.exportWorkbook('summary').counts.every(sheet=>sheet.rows===0)&&CalendarApp.exportWorkbook('all').counts[0].rows===1,'filtered export respects summary results while all export keeps every saved requirement');
CalendarApp.editRequirement(item.id);await settle();const name=$('.rf-form input[type=text]');name.value='未保存内容';name.dispatchEvent(new Event('input',{bubbles:true}));rejected=false;try{CalendarApp.exportWorkbook();}catch{rejected=true;}
assert(rejected&&CalendarApp.exportSnapshot()===raw,'export does not silently omit dirty changes or mutate committed records');
await CalendarApp.command('discard');await CalendarApp.command('summary');await settle();
return {checks,scope:'actual native WebKit workbook generation and macOS atomic write using an isolated destination adapter; native save-dialog gestures not asserted'};
