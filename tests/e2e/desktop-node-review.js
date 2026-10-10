// Isolated native WebKit and file bridge; synthetic renderer events.
const checks=[],$=s=>document.querySelector(s),$$=s=>Array.from(document.querySelectorAll(s));
const assert=(value,message)=>{if(!value)throw Error(message);checks.push(message);};
const settle=async()=>{while(CalendarApp.isSaving())await new Promise(r=>setTimeout(r,20));document.getAnimations().forEach(a=>a.finish());await new Promise(r=>setTimeout(r,80));document.getAnimations().forEach(a=>a.finish());};
const today=CalendarModel.localDate(),add=n=>CalendarModel.add(today,n),snap=()=>JSON.parse(CalendarApp.exportSnapshot());
const set=(n,v)=>{n.value=v;n.dispatchEvent(new Event('input',{bubbles:true}));};
const click=text=>{const b=$$('button').find(n=>n.textContent===text);if(!b)throw Error('Missing '+text);b.click();};
const select=(key,value)=>{const c=$('[data-summary-control='+key+']');c.focus();c.value=value;c.dispatchEvent(new Event('change',{bubbles:true}));};
const item={id:'reuse',title:'支付计划',tone:'rose',start:add(-5),end:add(40),phases:[{name:'方案',start:add(-5),end:add(-3)},{name:'开发',start:add(0),end:add(5)}],resources:[{name:'结算 PRD',type:'钉钉文档',url:''},{name:'支付设计',type:'设计稿',url:''},{name:'接口契约',type:'接口',url:'https://example.com/spec'}],tasks:['接口验收','回滚检查'],done:[true,false],note:'  保留方案与接口说明\n第二行  ',reminder:add(2)+'T10:00',milestones:[
 {id:'past',name:'待确认评审',date:add(-1),kind:'review',done:false},
 {id:'today',name:'方案评审',date:today,kind:'review',done:false},
 {id:'day7',name:'灰度发布',date:add(6),kind:'release',done:false},
 {id:'day8',name:'全量发布',date:add(7),kind:'release',done:false},
 {id:'done',name:'已完成评审',date:add(-2),kind:'review',done:true}]};
const other={...item,id:'other',title:'接口计划',phases:[],resources:[],tasks:[],done:[],reminder:null,milestones:[{id:'checkpoint',name:'接口联调',date:add(2),kind:'checkpoint',done:false}]};
const raw=JSON.stringify({version:7,anchor:today,requirements:[item,other]});
assert(await CalendarApp.restoreSnapshot(raw),'node review fixture persists through the native bridge');
const before=JSON.stringify(snap().requirements);
await CalendarApp.command('summary');await settle();
assert($$('.rf-summary-node').length===5&&$$('.rf-summary-row').length===2,'default overview retains all pending nodes and both requirements');
select('nodeKind','review');assert($$('.rf-summary-node').map(n=>n.dataset.nodeId).join(',')==='past,today','review type isolates pending reviews');
assert(document.activeElement===$('[data-summary-control=nodeKind]'),'node type filtering retains its control focus');
select('nodePeriod','7');assert($$('.rf-summary-node').map(n=>n.dataset.nodeId).join(',')==='today','rolling window combines with node type');
select('nodeKind','release');assert($$('.rf-summary-node').map(n=>n.dataset.nodeId).join(',')==='day7','seven-day window includes today through day six and excludes day seven');
select('nodePeriod','30');assert($$('.rf-summary-node').length===2,'thirty-day window expands the release plan');
const workbook=await CalendarApp.exportWorkbook('summary');assert(workbook.counts[0].rows===2&&workbook.counts[1].rows===6,'node-only filters leave full requirement and node export intact');
assert($('[data-export-excel]').getAttribute('aria-label').includes('全部时间节点')&&$('.rf-node-filter-help').textContent.includes('全部节点'),'export scope is explained beside node controls and on the export action');
select('scope','all');select('sort','next');set($('[data-summary-control=query]'),'计划');select('nodeCompletion','completed');
assert(!$('.rf-summary-node')&&$$('.rf-summary-row').length===2,'node empty state leaves matching requirement rows available');
click('重置节点筛选');assert($$('[data-node-group] .rf-summary-node').length===5&&$('[data-summary-control=nodeKind]').value==='all'&&$('[data-summary-control=nodePeriod]').value==='all'&&$('[data-summary-control=nodeCompletion]').value==='pending','node recovery resets only its three conditions');
assert($('[data-summary-control=query]').value==='计划'&&$('[data-summary-control=sort]').value==='next'&&$('[data-summary-control=scope]').value==='all'&&document.activeElement===$('[data-summary-control=nodeKind]'),'node recovery preserves requirement query, order, scope and usable focus');
select('nodeCompletion','completed');const completed=$('.rf-summary-node');assert(completed.dataset.nodeId==='done'&&completed.classList.contains('is-done')&&$('[data-node-group=completed]'),'completed history uses its own group and explicit completed treatment');
completed.click();await settle();let checkbox=$('.rf-node-detail[data-node-id=done] input');assert(document.activeElement===checkbox&&checkbox.checked,'completed history locates its already-completed detail without toggling it');
await CalendarApp.command('close');assert(document.activeElement===$('.rf-summary-node[data-node-id=done]'),'closing completed history returns to its source node');
assert(JSON.stringify(snap().requirements)===before,'all node views and history navigation leave committed requirements unchanged');
select('nodeCompletion','all');assert($$('.rf-summary-node').length===6&&$('[data-node-group=completed] .rf-summary-node'),'all-state view includes pending and completed nodes without mixing groups');
select('nodePeriod','overdue');assert($$('.rf-summary-node').map(n=>n.dataset.nodeId).join(',')==='past','overdue view excludes completed past nodes');
$('.rf-summary-node').click();await settle();assert($('.rf-node-detail[data-node-id=past]').classList.contains('is-overdue')&&$('.rf-node-detail[data-node-id=past]').textContent.includes('已过计划日期'),'detail identifies an overdue pending node in text and treatment');
checkbox=$('.rf-node-detail[data-node-id=past] input');checkbox.checked=true;checkbox.dispatchEvent(new Event('change',{bubbles:true}));await settle();
assert(!$('.rf-node-detail[data-node-id=past]').classList.contains('is-overdue')&&!$('.rf-summary-node'),'completing a late node removes overdue context and its filtered source');
await CalendarApp.command('close');assert(document.activeElement===$('.rf-summary-row[data-requirement-id=reuse]'),'removed node source returns focus to the corresponding requirement');
assert(await CalendarApp.restoreSnapshot(raw),'original reusable plan restores');if(!$('#rf-calendar').hidden)throw Error('expected summary view');await CalendarApp.command('summary');await settle();
CalendarApp.openRequirement('reuse');await settle();const marker=$$('.rf-node-marker').find(n=>n.dataset.nodeId==='past');assert(marker.classList.contains('is-overdue')&&marker.title.includes('已过计划日期'),'calendar retains node kind and explicitly marks overdue pending context');
CalendarApp.openRequirement('reuse');await settle();click('复制为新需求');await settle();
assert($('.rf-title-field input').value==='支付计划（副本）'&&CalendarApp.hasUnsavedChanges(),'copy opens a named protected draft before any additional typing');
const dates=$$('.rf-editor-basics input[type=date]');assert(snap().anchor===today&&dates[0].value===today&&dates[1].value===add(45)&&$('.rf-range-preview.is-visible'),'copy preserves full duration from today and keeps its date strip');
assert($$('.rf-milestone-edit input[type=checkbox]').every(n=>!n.checked)&&$$('.rf-task-edit input[type=checkbox]').every(n=>!n.checked)&&$('input[type=datetime-local]').value==='','copied draft resets completion and explicit reminder while keeping work');
assert(JSON.stringify(snap().requirements)===before,'copying creates no committed record and leaves the source untouched');
const counts=()=>$$('.rf-editor-count').map(n=>n.hidden?'0':n.textContent).join(',');assert(counts()==='2,5,3,2','continuous editor counts phases, nodes, resources and tasks');
click('添加资料');assert(counts()==='2,5,4,2','adding a resource updates its section count immediately');$('[data-editor-panel=resources] .rf-editor-item:last-child .rf-remove').click();assert(counts()==='2,5,3,2','removing the resource restores its count');
click('取消');assert($('#rf-discard').open,'untouched copied plan is protected on cancellation');$('#rf-discard-keep').click();assert($('.rf-title-field input').value==='支付计划（副本）','continue editing retains the complete copied draft');
const bridge=webkit.messageHandlers.calendar,post=bridge.postMessage;
try{bridge.postMessage=async message=>{if(message.action==='save')throw Error('isolated duplicate failure');return post.call(bridge,message);};assert(!await CalendarApp.command('save'),'copy save failure is reported');assert(snap().requirements.length===2&&CalendarApp.hasUnsavedChanges()&&$('.rf-form'),'failed copy save retains the protected form without creating a partial record');}finally{bridge.postMessage=post;}
assert(await CalendarApp.command('save'),'copy saves through the real native file bridge');await settle();
const copy=snap().requirements.find(n=>n.id!=='reuse'&&n.id!=='other');assert(copy&&copy.start===today&&copy.end===add(45)&&copy.phases[0].end===add(2)&&copy.phases[1].start===add(5),'committed copy preserves shifted phase durations and gaps');
assert(copy.milestones.every(n=>!n.done&&!item.milestones.some(old=>old.id===n.id))&&copy.done.every(done=>!done)&&copy.reminder===null&&copy.resources.length===3&&copy.note===item.note,'committed copy has independent node identities, reset work and original materials');
assert(JSON.stringify(snap().requirements.find(n=>n.id==='reuse'))===JSON.stringify(CalendarModel.requirement(item)),'committing a copy leaves the original requirement intact');
click('复制为新需求');await settle();click('取消');$('#rf-discard-drop').click();await settle();assert(snap().requirements.length===3&&$('#rf-detail').hidden&&!CalendarApp.hasUnsavedChanges(),'discarding another copy creates no extra record');
await CalendarApp.command('new');await settle();assert($$('.rf-editor-count').every(n=>n.hidden),'empty editor counts remain hidden without extra empty rows');click('添加事项');assert($$('.rf-editor-count').at(-1).textContent==='1','new task updates its quantity');$('.rf-task-edit .rf-remove').click();assert($$('.rf-editor-count').at(-1).hidden,'removing the last task hides its empty quantity');await CalendarApp.command('discard');
if(!$('#rf-summary').hidden)await CalendarApp.command('summary');await CalendarApp.command('summary');select('nodeKind','release');select('nodePeriod','7');assert(await CalendarApp.command('exportExcel'),'filtered node view exports the full selected requirements through actual native XLSX output');
await webkit.messageHandlers.calendar.postMessage({action:'verifyWindow',save:true});await settle();
$('.rf-summary-node').click();await settle();const summaryBox=$('#rf-summary').getBoundingClientRect();
assert($$('.rf-node-controls select').every(n=>{const b=n.getBoundingClientRect();return b.left>=summaryBox.left&&b.right<=summaryBox.right&&b.height>=29;}),'node selectors retain readable height and fit the narrower summary beside details');
assert($$('.rf-detail-actions button').every(n=>{const b=n.getBoundingClientRect(),p=$('#rf-detail').getBoundingClientRect();return b.left>=p.left&&b.right<=p.right;}),'edit, copy and delete actions fit the smaller native inspector');
assert(document.documentElement.scrollHeight<=innerHeight+1&&document.documentElement.scrollWidth<=innerWidth+1,'node controls and copy workflow stay within the desktop viewport');
return {checks,scope:'isolated native WebKit with real file persistence and XLSX export, synthetic controls, injected save failure; no trusted input, system notification or intermediate-motion claim'};
