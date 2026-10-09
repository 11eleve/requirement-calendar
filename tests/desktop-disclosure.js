// Native WebKit animation geometry and edit behavior; no trusted pointer timing.
const checks=[],measurements=[],$=s=>document.querySelector(s),$$=s=>Array.from(document.querySelectorAll(s));
const assert=(value,message)=>{if(!value)throw Error(message);checks.push(message);};
const tick=()=>new Promise(resolve=>setTimeout(resolve,30));
const settle=async()=>{document.getAnimations().forEach(a=>a.finish());await tick();document.getAnimations().forEach(a=>a.finish());await tick();};
const body=row=>row.querySelector('.rf-disclosure-body'),summary=row=>row.querySelector('summary');
const height=row=>body(row).getBoundingClientRect().height;
const motion=row=>body(row).getAnimations().find(a=>a.effect.getKeyframes().some(frame=>'height' in frame));
function seek(row,time){const a=motion(row);assert(!!a,'height animation is exposed for measurement');a.pause();a.currentTime=time;return height(row);}
const item={id:'disclosure',title:'认证服务排期',tone:'blue',start:'2026-10-01',end:'2026-10-31',phases:[{name:'评审',start:'2026-10-01',end:'2026-10-03'},{name:'开发',start:'2026-10-04',end:'2026-10-31'}],resources:[{name:'接口约定',type:'接口',url:'https://example.com/api'},{name:'灰度方案',type:'评审文档',url:''}],tasks:['确认兼容范围'],done:[false],note:'保留原有说明'};
const others=Array.from({length:13},(_,i)=>({...item,id:'other-'+i,title:'并行需求 '+i,phases:[],resources:[],tasks:[],done:[]}));
assert(await CalendarApp.restoreSnapshot(JSON.stringify({version:6,anchor:'2026-10-01',requirements:[item,...others]})),'isolated motion fixture restored');
CalendarApp.editRequirement(item.id);await settle();
const calendar=$('#rf-calendar');calendar.scrollTop=240;await settle();const original=CalendarApp.exportSnapshot(),calendarTop=calendar.scrollTop;
let rows=$$('[data-editor-panel=resources] .rf-disclosure'),first=rows[0],second=rows[1];
assert(rows.every(row=>row.tagName==='DETAILS'&&summary(row).tagName==='SUMMARY'&&summary(row).getAttribute('aria-controls')===body(row).id&&summary(row).getAttribute('aria-expanded')==='false'&&body(row).inert),'native summaries identify their collapsed and inactive content');
summary(first).click();
assert(first.open&&!body(first).inert&&summary(first).getAttribute('aria-expanded')==='true'&&document.activeElement===summary(first),'opening immediately exposes the intended state and retains summary focus');
const start=seek(first,0),middle=seek(first,90);await settle();const expanded=height(first);
assert(start<1&&middle>start+1&&middle<expanded-1,'opening has a real intermediate content height');
assert(!motion(first)&&!body(first).classList.contains('is-animating')&&body(first).style.height==='','opening releases temporary size and clipping');
measurements.push({kind:'resource',opening:[start,middle,expanded]});
summary(first).click();
assert(first.open&&body(first).inert&&summary(first).getAttribute('aria-expanded')==='false','closing immediately removes input interaction while keeping content for the short exit');
first.querySelector('input').focus();assert(document.activeElement===summary(first),'exiting content cannot take focus');
const closingStart=seek(first,0),closingMiddle=seek(first,90);await settle();
// Closed native details may retain a skipped child's intrinsic rect. Measure
// the space occupied by the row rather than that hidden child's cached rect.
const closedSpace=first.getBoundingClientRect().height-summary(first).getBoundingClientRect().height;
assert(closingStart>closingMiddle+1&&closingMiddle>1&&!first.open&&Math.abs(closedSpace)<1,'closing interpolates before the native details element closes');
measurements[0].closing=[closingStart,closingMiddle,closedSpace];
assert(CalendarApp.exportSnapshot()===original&&!CalendarApp.hasUnsavedChanges()&&calendar.scrollTop===calendarTop&&!!$('.rf-range-preview.is-visible'),'folding preserves saved data, clean draft, calendar reading position and date strip');

summary(first).click();const forward=seek(first,60);summary(first).click();const reverseStart=seek(first,0);
assert(Math.abs(forward-reverseStart)<1,'reversing an opening starts from its displayed height');
const reverse=seek(first,60);summary(first).click();const reopenStart=seek(first,0);
assert(Math.abs(reverse-reopenStart)<1,'reopening an interrupted close keeps the displayed height');
await settle();assert(first.open&&!body(first).inert&&summary(first).getAttribute('aria-expanded')==='true','coalesced native toggle events do not override the latest intent');
summary(second).click();await settle();
assert(!first.open&&second.open&&rows.filter(row=>row.open).length===1,'opening another resource settles with only that row expanded');
assert(first.querySelector('input').value===item.resources[0].name&&second.querySelector('input').value===item.resources[1].name,'coordinated folding retains the original fields');
summary(second).click();seek(second,90);CalendarDisclosure.setOpen(second,true);second.querySelector('input').focus();
assert(second.open&&!motion(second)&&!body(second).inert&&document.activeElement===second.querySelector('input')&&height(second)>1,'direct field access cancels an exit and expands immediately');
second.open=false;await settle();assert(!second.open&&body(second).inert&&summary(second).getAttribute('aria-expanded')==='false','external native closing synchronizes state');
second.open=true;await settle();assert(second.open&&!body(second).inert&&!motion(second)&&summary(second).getAttribute('aria-expanded')==='true','external native opening remains immediate and synchronized');

const input=second.querySelector('input');input.value='灰度方案修订';input.dispatchEvent(new Event('input',{bubbles:true}));input.setSelectionRange(2,4);
summary(second).click();await settle();summary(second).click();await settle();
assert(second.querySelector('input')===input&&input.value==='灰度方案修订'&&input.selectionStart===2&&input.selectionEnd===4&&CalendarApp.hasUnsavedChanges(),'folding retains the edited field node, value, selection and dirty state');
const bridge=webkit.messageHandlers.calendar,post=bridge.postMessage;
let saved;try{bridge.postMessage=async message=>{if(message.action==='save')throw Error('isolated disclosure save failure');return post.call(bridge,message);};saved=await CalendarApp.command('save');}finally{bridge.postMessage=post;}
assert(!saved&&input.isConnected&&input.value==='灰度方案修订'&&CalendarApp.exportSnapshot()===original&&CalendarApp.hasUnsavedChanges(),'a save failure keeps the expanded draft and saved snapshot');
summary(second).click();assert(!!motion(second),'saving can be exercised during an exit');
assert(await CalendarApp.command('save'),'retry saves through the isolated native bridge');await settle();
assert(!input.isConnected&&!motion(second)&&JSON.parse(CalendarApp.exportSnapshot()).requirements.find(r=>r.id===item.id).resources[1].name==='灰度方案修订','successful save disposes old motion and preserves the edited resource');

CalendarApp.editRequirement(item.id);await settle();rows=$$('[data-editor-panel=resources] .rf-disclosure');first=rows[0];summary(first).click();seek(first,90);
const removedBody=body(first);first.closest('.rf-editor-item').querySelector('.rf-remove').click();await settle();
assert(!removedBody.isConnected&&!removedBody.getAnimations().length&&document.activeElement===$('[data-editor-panel=resources] .rf-disclosure summary'),'removing an animating row cancels motion and focuses its neighbour');
await CalendarApp.command('close');$('#rf-discard-drop').click();await settle();
CalendarApp.editRequirement(item.id);await settle();
const phase=$('[data-editor-panel=phases] .rf-disclosure');summary(phase).click();const phaseStart=seek(phase,0),phaseMiddle=seek(phase,90);await settle();
assert(phaseMiddle>phaseStart+1&&phaseMiddle<height(phase)-1&&phase.querySelector('input[type=date]').value==='2026-10-01','stage disclosure uses the same motion without changing its dates');
measurements.push({kind:'phase',opening:[phaseStart,phaseMiddle,height(phase)]});
await webkit.messageHandlers.calendar.postMessage({action:'verifyWindow',save:true});await settle();
assert(document.documentElement.scrollWidth<=innerWidth+1&&document.documentElement.scrollHeight<=innerHeight+1,'expanded stages remain within the smaller native viewport');
await CalendarApp.command('close');await settle();

// Exercise injected preference and API fallbacks without changing macOS settings.
const host=document.createElement('div');host.style.cssText='position:fixed;left:0;top:0;width:240px';$('#req-calendar-refined').append(host);
function isolated(options={}){const row=document.createElement('details');row.className='rf-disclosure';row.innerHTML='<summary class="rf-item-summary">示例</summary><div class="rf-disclosure-body"><div style="padding:12px"><input aria-label="示例内容" value="原内容"></div></div>';host.append(row);const c=CalendarDisclosure.create(row,body(row),options);return {row,c};}
const reduced=isolated({allowMotion:()=>false});summary(reduced.row).click();assert(reduced.row.open&&!motion(reduced.row)&&!body(reduced.row).inert,'injected reduced-motion preference opens immediately');summary(reduced.row).click();assert(!reduced.row.open&&!motion(reduced.row)&&body(reduced.row).inert,'injected reduced-motion preference closes immediately');reduced.c.dispose();
const unavailable=isolated();Object.defineProperty(body(unavailable.row),'animate',{value:undefined});summary(unavailable.row).click();assert(unavailable.row.open&&!body(unavailable.row).inert,'missing animation API preserves native expansion');summary(unavailable.row).click();assert(!unavailable.row.open,'missing animation API preserves native collapse');unavailable.c.dispose();
const failing=isolated();body(failing.row).animate=()=>{throw Error('animation unavailable');};summary(failing.row).click();assert(failing.row.open&&!body(failing.row).classList.contains('is-animating'),'animation errors fall back to a complete expanded state');summary(failing.row).click();assert(!failing.row.open&&body(failing.row).inert,'animation errors also settle a complete closed state');failing.c.dispose();host.remove();
return {checks,measurements,appearance:matchMedia('(prefers-color-scheme:dark)').matches?'dark':'light',reducedMotion:matchMedia('(prefers-reduced-motion:reduce)').matches,scope:'actual isolated native WebKit heights at explicitly paused animation times, activeElement/selection and native persistence with synthetic clicks/inputs and injected save failure. Reduced-motion branch uses an injected preference; OS preference, trusted keyboard activation, frame pacing and pointer feel are not asserted'};
