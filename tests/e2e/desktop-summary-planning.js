const checks=[],$=selector=>document.querySelector(selector),$$=selector=>Array.from(document.querySelectorAll(selector));
const assert=(value,message)=>{if(!value)throw Error(message);checks.push(message);};
const settle=async()=>{document.getAnimations().forEach(animation=>animation.finish());await new Promise(resolve=>setTimeout(resolve,60));};
const today=CalendarModel.localDate(),add=delta=>CalendarModel.add(today,delta);
const base={id:'alpha',title:'认证迁移',tone:'teal',start:add(-5),end:add(20),phases:[],resources:[],tasks:['检查兼容'],done:[false],note:'',milestones:[
 {id:'past',name:'契约确认',date:add(-1),kind:'review',done:false},
 {id:'today',name:'接口联调',date:today,kind:'checkpoint',done:false},
 {id:'future',name:'灰度发布',date:add(7),kind:'release',done:false}
]};
const next={...base,id:'beta',title:'结算改造',start:add(-10),milestones:[{id:'next',name:'交互评审',date:add(3),kind:'review',done:false}],tasks:[],done:[]};
const unknown={...base,id:'empty',title:'待细化排期',tasks:[],done:[],milestones:[]};
assert(await CalendarApp.restoreSnapshot(JSON.stringify({version:7,anchor:today,requirements:[base,next,unknown]})),'planning fixture restores with real native persistence');
await CalendarApp.command('summary');await settle();
assert($('[data-node-group=past] [data-node-id=past]')&&$('[data-node-group=today] [data-node-id=today]')&&$('[data-node-group=future] [data-node-id=future]'),'pending nodes group by overdue, today and future without dropping identity');
assert($$('[data-node-group=future] .rf-summary-node').map(node=>node.dataset.nodeId).join(',')==='next,future','future group keeps chronological order across requirements');
assert($('.rf-node-scope').textContent.includes('跨月')&&$$('.rf-summary-node').length===4,'node heading explains requirement-based scope including cross-month nodes');
const select=(key,value)=>{const control=$('[data-summary-control='+key+']');control.focus();control.value=value;control.dispatchEvent(new Event('change',{bubbles:true}));};
select('sort','next');await settle();
assert($$('.rf-summary-row').map(row=>row.dataset.requirementId).join(',')==='alpha,beta,empty','next-node ordering prioritizes the pending date and places undated requirements last');
assert($('.rf-summary-row[data-requirement-id=alpha] .rf-summary-next').textContent.includes('契约确认')&&$('.rf-summary-row[data-requirement-id=empty] .rf-summary-next').textContent==='暂无待办节点','next-node ordering exposes the actual reason for row position');
assert(document.activeElement===$('[data-summary-control=sort]'),'changing ordering retains focus in the recreated selector');
$('.rf-summary-node[data-node-id=past]').click();await settle();
const check=$('.rf-node-detail[data-node-id=past] input');check.checked=true;check.dispatchEvent(new Event('change',{bubbles:true}));
while(CalendarApp.isSaving())await new Promise(resolve=>setTimeout(resolve,20));await settle();
assert(!$('[data-node-group=past]')&&$('.rf-summary-row[data-requirement-id=alpha] .rf-summary-next').textContent.includes('接口联调'),'completing a node removes its empty date group and refreshes next-node context');
await CalendarApp.command('close');
select('sort','progress');assert($$('.rf-summary-row')[0].dataset.requirementId==='alpha','zero-progress work appears before requirements with no task denominator');
let query=$('[data-summary-control=query]');query.value='无匹配字符串';query.dispatchEvent(new Event('input',{bubbles:true}));await settle();
const clear=$$('.rf-summary-empty button').find(button=>button.textContent==='清除条件');assert(clear&&!$('.rf-summary-row'),'filtered empty state offers a concrete recovery action');clear.click();await settle();
assert($$('.rf-summary-row').length===3&&document.activeElement===$('[data-summary-control=query]')&&$('[data-summary-control=sort]').value==='progress','empty-state recovery restores results and keeps scope, ordering and search focus');
const distant={...unknown,start:add(65),end:add(70)};
assert(await CalendarApp.restoreSnapshot(JSON.stringify({version:7,anchor:today,requirements:[distant]})),'future-only fixture restores');await settle();
const showAll=$$('.rf-summary-empty button').find(button=>button.textContent==='查看全部需求');assert(showAll&&!$('.rf-summary-row'),'month with no matching schedule offers all-requirement navigation');showAll.click();await settle();
assert($('.rf-summary-row')&&$('[data-summary-control=scope]').value==='all'&&document.activeElement===$('[data-summary-control=scope]'),'all-requirement navigation makes the future schedule visible and restores scope focus');
const bridge=webkit.messageHandlers.calendar,post=bridge.postMessage,bounds=$('#rf-summary').getBoundingClientRect();
let finish;bridge.postMessage=message=>message.action==='exportExcel'?new Promise(resolve=>{finish=resolve;}):post.call(bridge,message);
const pending=CalendarApp.command('exportExcel');await settle();
assert(!$('#rf-export-status').hidden&&getComputedStyle($('#rf-export-status')).position==='fixed'&&$('#rf-summary').getBoundingClientRect().height===bounds.height,'export feedback floats without resizing the planning surface');
$('#rf-export-dismiss').click();assert($('#rf-export-status').hidden&&$('[data-export-excel]').disabled&&document.activeElement===$('#rf-view'),'dismissing an in-flight status does not allow duplicate export and returns to a usable control');
finish({saved:true});assert(await pending,'pending export resolves');
$('#rf-export-dismiss').click();assert($('#rf-export-status').hidden&&document.activeElement===$('[data-export-excel]'),'completed export dismissal returns focus to its available action');
bridge.postMessage=async message=>{if(message.action==='exportExcel')throw Error('destination denied');return post.call(bridge,message);};
assert(!await CalendarApp.command('exportExcel')&&$('#rf-export-status').getAttribute('role')==='alert'&&$('#rf-export-message').textContent.includes('destination denied'),'export failure remains visible and independently dismissible');$('#rf-export-dismiss').click();bridge.postMessage=post;
assert(await CalendarApp.restoreSnapshot(JSON.stringify({version:7,anchor:today,requirements:[]})),'empty installation fixture restores');await settle();
const back=$$('.rf-summary-empty button').find(button=>button.textContent==='返回日历');assert(back,'empty installation offers a direct calendar action');back.click();await settle();
assert(!$('#rf-calendar').hidden&&$('#rf-summary').hidden&&document.activeElement===$('#rf-view'),'empty-state calendar action restores the month view and keyboard entry');
assert(document.documentElement.scrollHeight<=innerHeight+1&&document.documentElement.scrollWidth<=innerWidth+1,'planning feedback and recovery stay within the desktop viewport');
return {checks,scope:'isolated native WebKit with real persistence; synthetic control actions and injected Excel save responses; no real Save-panel or OS notification claim'};
