// Actual WebKit hit testing, preview geometry and native persistence. Pointer
// capture and edge-scroll frame delivery are injected; no trusted gesture claim.
const checks=[],measurements={},$=s=>document.querySelector(s),$$=s=>Array.from(document.querySelectorAll(s));
const assert=(value,message)=>{if(!value)throw Error(message);checks.push(message);};
const tick=()=>new Promise(resolve=>setTimeout(resolve,30));
const settle=async()=>{document.getAnimations().forEach(a=>a.finish());await tick();document.getAnimations().forEach(a=>a.finish());await tick();};
const snapshot=()=>JSON.parse(CalendarApp.exportSnapshot()),saved=()=>snapshot().requirements.find(r=>r.id==='move');
const activeForm=()=>$('#rf-detail').hidden?null:$('.rf-form');
const source={id:'move',title:'认证链路迁移',tone:'blue',start:'2026-10-03',end:'2026-11-03',phases:[{name:'评审',start:'2026-10-03',end:'2026-10-06'},{name:'开发',start:'2026-10-10',end:'2026-10-28'}],resources:[{name:'接口约定',type:'自定义接口',url:'https://example.com/auth?signature='+('a'.repeat(512))}],tasks:['确认兼容范围','验证回滚'],done:[true,false],note:'\n    keep indentation\n\tand tabs  ',reminder:'2026-10-02T09:30'};
const calendar=$('#rf-calendar'),bridge=webkit.messageHandlers.calendar;
const restore=async(items=[source],anchor='2026-10-01')=>{assert(await CalendarApp.restoreSnapshot(JSON.stringify({version:6,anchor,requirements:items})),'isolated replan fixture restored');await settle();};
const cell=date=>$$('.rf-date').find(n=>n.dataset.date===date);
const point=date=>{const n=cell(date),r=n.getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+50};};
const origin=date=>{const n=cell(date),r=n.getBoundingClientRect(),bar=Array.from(n.closest('.rf-week').querySelectorAll('.rf-bar')).find(n=>n.dataset.requirementId==='move'),b=bar.getBoundingClientRect();return {bar,p:{x:r.left+r.width/2,y:b.top+b.height/2}};};
const pointer=(target,type,p,extra={})=>target.dispatchEvent(new PointerEvent(type,{pointerId:73,isPrimary:true,button:0,bubbles:true,cancelable:true,clientX:p.x,clientY:p.y,...extra}));
const dates=()=>$$('[data-editor-panel=basic] input[type=date]').map(n=>n.value);
const phaseDates=()=>$$('[data-editor-panel=phases] input[type=date]').map(n=>n.value);
const preview=()=>$$('.rf-range-preview.is-visible').map(n=>({left:n.style.left,width:n.style.width,className:n.className}));
async function drop(from,to,{move=true}={}){const o=origin(from),p=point(to);pointer(o.bar,'pointerdown',o.p);if(move)pointer(o.bar,'pointermove',p);pointer(o.bar,'pointerup',p);await settle();return o;}
async function discard(){await CalendarApp.command('close');if($('#rf-discard').open)$('#rf-discard-drop').click();await settle();}
const capture={set:Element.prototype.setPointerCapture,has:Element.prototype.hasPointerCapture,raf:window.requestAnimationFrame,cancel:window.cancelAnimationFrame};
let frames=new Map(),nextFrame=0;
Element.prototype.setPointerCapture=()=>{};Element.prototype.hasPointerCapture=()=>false;
window.requestAnimationFrame=fn=>{const id=++nextFrame;frames.set(id,fn);return id;};window.cancelAnimationFrame=id=>frames.delete(id);
const pump=()=>{const entry=frames.entries().next().value;if(entry){frames.delete(entry[0]);entry[1](performance.now());}};
try{
 await restore();const original=CalendarApp.exportSnapshot(),o=origin('2026-10-03');
 pointer(o.bar,'pointerdown',o.p);pointer(o.bar,'pointermove',{x:o.p.x+3,y:o.p.y+3});
 assert(!$('.rf-range-preview.is-visible')&&!$('#req-calendar-refined').classList.contains('is-replanning'),'a slight click movement does not start a replan');
 pointer(o.bar,'pointerup',o.p);o.bar.click();await settle();
 assert(!activeForm()&&$('.rf-detail-title').textContent===source.title,'ordinary band clicks still open the original detail');
 assert(CalendarApp.exportSnapshot()===original,'ordinary clicks change no saved dates');

 const dragOrigin=origin('2026-10-03'),target=point('2026-10-07');pointer(dragOrigin.bar,'pointerdown',dragOrigin.p);pointer(dragOrigin.bar,'pointermove',target);await settle();
 assert($('#req-calendar-refined').classList.contains('is-replanning')&&$$('[data-requirement-id=move]').every(n=>n.classList.contains('is-moving')),'all continuation pieces identify the moving requirement');
 assert(preview().length>0&&$$('.rf-range-preview.is-visible').every(n=>n.classList.contains('blue')),'dragging shows the requirement tone as date strips');
 assert(!$$('.rf-date').some(n=>n.classList.contains('is-selected'))&&CalendarApp.exportSnapshot()===original,'dragging neither fills selected cells nor changes saved data');
 pointer(dragOrigin.bar,'pointerup',target);await settle();
 assert(dates().join(',')==='2026-10-07,2026-11-07'&&CalendarApp.hasUnsavedChanges(),'drop opens an immediately dirty draft with the moved period');
 assert(phaseDates().join(',')==='2026-10-07,2026-10-10,2026-10-14,2026-11-01','all phases shift equally while retaining the gap and cross-month dates');
 assert(CalendarApp.exportSnapshot()===original&&!!$('.rf-range-preview.is-visible'),'the original schedule remains saved and the moved strip stays visible while editing');
 assert(!$(' .rf-bar.is-moving')&&!$('#req-calendar-refined').classList.contains('is-replanning')&&frames.size===0,'drop releases temporary moving state and scroll frames');
 const draft=activeForm(),range=JSON.stringify(preview());
 pointer(dragOrigin.bar,'click',target);dragOrigin.bar.click();
 assert(activeForm()===draft&&!$('#rf-discard').open,'a trailing click cannot replace the moved draft with details');
 await CalendarApp.command('close');assert($('#rf-discard').open,'closing protects a moved draft before any text input');$('#rf-discard-keep').click();
 assert(activeForm()===draft&&JSON.stringify(preview())===range,'continue editing retains the moved range and complete draft');
 const dirtyOrigin=origin('2026-10-07');pointer(dirtyOrigin.bar,'pointerdown',dirtyOrigin.p);pointer(dirtyOrigin.bar,'pointermove',point('2026-10-08'));pointer(dirtyOrigin.bar,'pointerup',point('2026-10-08'));
 assert(activeForm()===draft&&JSON.stringify(preview())===range&&dates()[0]==='2026-10-07','a new drag cannot overwrite an already dirty draft or its persistent strip');
 await discard();assert(CalendarApp.exportSnapshot()===original&&!$('.rf-range-preview.is-visible'),'discard restores the original committed plan and removes draft feedback');

 await drop('2026-10-03','2026-10-07');
 const post=bridge.postMessage;let result;
 try{bridge.postMessage=async message=>{if(message.action==='save')throw Error('isolated replan save failure');return post.call(bridge,message);};result=await CalendarApp.command('save');}finally{bridge.postMessage=post;}
 assert(!result&&!!activeForm()&&CalendarApp.hasUnsavedChanges()&&dates()[0]==='2026-10-07'&&CalendarApp.exportSnapshot()===original,'failed native persistence retains moved input and the prior saved plan');
 assert(await CalendarApp.command('save'),'retry saves the moved plan through the native bridge');await settle();
 const moved=saved(),normalized=CalendarModel.requirement(source);
 assert(moved.start==='2026-10-07'&&moved.end==='2026-11-07'&&moved.phases[1].end==='2026-11-01','saved period and phases contain the exact calendar-day shift');
 assert(['id','title','tone','resources','tasks','done','note','reminder'].every(key=>JSON.stringify(moved[key])===JSON.stringify(normalized[key])),'identity, custom resources, completion, whitespace and explicit reminder time are preserved');
 assert(!CalendarApp.hasUnsavedChanges()&&!$('.rf-range-preview.is-visible')&&$$('[data-requirement-id=move]').every(n=>n.classList.contains('is-selected')),'save replaces the moved strip with selected committed continuation bands');
 await drop('2026-10-21','2026-10-13');
 assert(dates().join(',')==='2026-09-29,2026-10-30'&&phaseDates()[0]==='2026-09-29','dragging a middle continuation moves relative to the grabbed day, including reverse cross-month movement');
 await discard();
 await drop('2026-10-21','2026-10-22',{move:false});
 assert(dates()[0]==='2026-10-08','release position is honored even when an intermediate move event was coalesced');await discard();

 // Cancellation leaves the existing detail and committed schedule intact.
 CalendarApp.openRequirement('move');await settle();
 for(const kind of ['outside','escape','blur','pointercancel','lostpointercapture']){
  const before=CalendarApp.exportSnapshot(),start=origin('2026-10-21');pointer(start.bar,'pointerdown',start.p);pointer(start.bar,'pointermove',point('2026-10-22'));
  pointer(start.bar,'pointercancel',start.p,{pointerId:99});assert($('#req-calendar-refined').classList.contains('is-replanning'),'an unrelated pointer does not cancel the active replan');
  if(kind==='outside')pointer(start.bar,'pointerup',{x:-10,y:-10});
  else if(kind==='escape')start.bar.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}));
  else if(kind==='blur')window.dispatchEvent(new Event('blur'));
  else pointer(start.bar,kind,start.p);
  assert(!activeForm()&&!$('.rf-range-preview.is-visible')&&!$('.rf-bar.is-moving')&&frames.size===0&&CalendarApp.exportSnapshot()===before,kind+' cancels the replan and releases all temporary state');
  start.bar.click();assert(!activeForm()&&$('.rf-detail-title').textContent===source.title,kind+' suppresses its trailing click without closing the current detail');
 }
 const noOp=origin('2026-10-21');pointer(noOp.bar,'pointerdown',noOp.p);pointer(noOp.bar,'pointermove',{x:noOp.p.x+10,y:noOp.p.y});pointer(noOp.bar,'pointerup',{x:noOp.p.x+10,y:noOp.p.y});
 assert(!activeForm()&&!$('.rf-range-preview.is-visible'),'moving within the same date does not create a redundant draft');

 await restore();const changing=origin('2026-10-03');pointer(changing.bar,'pointerdown',changing.p);pointer(changing.bar,'pointermove',point('2026-10-07'));await CalendarApp.command('next');await settle();
 assert(!$('.rf-bar.is-moving')&&!$('.rf-range-preview.is-visible')&&frames.size===0&&!activeForm()&&snapshot().anchor==='2026-11-01','month navigation safely cancels a held gesture before rerendering');
 await restore();const shown=origin('2026-10-03');pointer(shown.bar,'pointerdown',shown.p);pointer(shown.bar,'pointermove',point('2026-10-07'));CalendarApp.openRequirement('move');await settle();
 assert(!$('.rf-bar.is-moving')&&!$('.rf-range-preview.is-visible')&&frames.size===0&&!activeForm()&&$('.rf-detail-title').textContent===source.title,'external detail navigation cancels a held replan');

 // A held gesture is canceled before an asynchronous native save starts.
 await restore();const busyOrigin=origin('2026-10-03');pointer(busyOrigin.bar,'pointerdown',busyOrigin.p);pointer(busyOrigin.bar,'pointermove',point('2026-10-07'));
 const nativePost=bridge.postMessage;let resumeSave,saveMessage,pending;
 try{
  bridge.postMessage=message=>{if(message.action==='save'){saveMessage=message;return new Promise(resolve=>{resumeSave=resolve;});}return nativePost.call(bridge,message);};
  pending=CalendarApp.command('next');await tick();
  assert(CalendarApp.isSaving()&&!$('.rf-bar.is-moving')&&!$('.rf-range-preview.is-visible')&&frames.size===0,'starting native persistence cancels the held replan before busy state');
  const busyBar=$('[data-requirement-id=move]'),r=busyBar.getBoundingClientRect(),p={x:r.left+10,y:r.top+10};pointer(busyBar,'pointerdown',p);pointer(busyBar,'pointermove',{x:p.x+20,y:p.y});pointer(busyBar,'pointerup',{x:p.x+20,y:p.y});
  assert(!$('#req-calendar-refined').classList.contains('is-replanning')&&!activeForm(),'busy persistence rejects a new replan');
 }finally{bridge.postMessage=nativePost;if(resumeSave)resumeSave(await nativePost.call(bridge,saveMessage));if(pending)await pending;}
 await restore();CalendarApp.editRequirement('move');await settle();const cleanForm=activeForm();await drop('2026-10-03','2026-10-05');
 assert(activeForm()!==cleanForm&&dates()[0]==='2026-10-05'&&CalendarApp.hasUnsavedChanges(),'a clean existing editor can be replaced by an accurately dirty moved draft');await discard();

 await restore();CalendarApp.editRequirement('move');await settle();const typedForm=activeForm(),typing=origin('2026-10-03');pointer(typing.bar,'pointerdown',typing.p);pointer(typing.bar,'pointermove',point('2026-10-07'));
 const name=$('.rf-form input[type=text]');name.value='保留同时输入的名称';name.dispatchEvent(new Event('input',{bubbles:true}));
 assert(!$('#req-calendar-refined').classList.contains('is-replanning')&&frames.size===0,'typing into a clean editor cancels its held replan immediately');
 pointer(typing.bar,'pointerup',point('2026-10-07'));
 assert(activeForm()===typedForm&&name.value==='保留同时输入的名称'&&dates()[0]===source.start&&!$('#rf-discard').open,'release after concurrent typing cannot replace the newly dirty draft');await discard();
 const upper={...source,start:'9999-11-25',end:'9999-12-31',phases:[],reminder:null};await restore([upper],'9999-12-01');const edge=origin('9999-12-03');pointer(edge.bar,'pointerdown',edge.p);pointer(edge.bar,'pointermove',point('9999-12-04'));
 assert($('#req-calendar-refined').classList.contains('is-replan-invalid'),'an overflowing calendar-day shift is visibly rejected');pointer(edge.bar,'pointerup',point('9999-12-04'));await settle();
 assert(!activeForm()&&!$('.rf-range-preview.is-visible')&&saved().end==='9999-12-31','overflow cannot publish an invalid date or partial phase shift');

 const denseSource={...source,start:'2026-10-01',end:'2026-10-31',phases:[{name:'评审',start:'2026-10-01',end:'2026-10-03'},{name:'开发',start:'2026-10-05',end:'2026-10-23'}]};
 await restore([denseSource,...Array.from({length:13},(_,i)=>({...denseSource,id:'other-'+i,title:'并行需求 '+i}))]);
 const dense=origin('2026-10-01'),bounds=calendar.getBoundingClientRect(),edgePoint={x:dense.p.x,y:bounds.bottom-8};pointer(dense.bar,'pointerdown',dense.p);pointer(dense.bar,'pointermove',edgePoint);
 for(let i=0;i<6;i++)pump();
 assert(calendar.scrollTop>0&&frames.size===1&&!!$('.rf-range-preview.is-visible'),'injected edge-scroll frames move the actual dense calendar and retain feedback');
 const visibleStrip=$$('.rf-range-preview.is-visible').find(n=>{const r=n.getBoundingClientRect();return r.top>=$('.rf-weekdays').getBoundingClientRect().bottom&&r.bottom<=calendar.getBoundingClientRect().bottom;});
 assert(!!visibleStrip,'the moved range is actually visible in the dense scrolled viewport');
 measurements.denseDuringDrag={scroll:calendar.scrollTop,strip:visibleStrip.getBoundingClientRect().toJSON(),viewport:calendar.getBoundingClientRect().toJSON()};
 pointer(dense.bar,'pointerup',edgePoint);await settle();
 assert(dates()[0]==='2026-10-08'&&frames.size===0,'edge scrolling re-hit-tests the date under the held pointer and stops after drop');
 calendar.scrollTop=850;await settle();const pinned=$$('.rf-range-preview.is-visible').find(n=>{const r=n.getBoundingClientRect();return Math.abs(r.top-$('.rf-weekdays').getBoundingClientRect().bottom-31)<1;});
 assert(!!pinned,'editing keeps a real range strip pinned beneath dates within a dense week');
 const pinnedBounds=pinned.getBoundingClientRect();assert(document.elementFromPoint(pinnedBounds.left+5,pinnedBounds.top+1)?.closest('.rf-date')?.dataset.date==='2026-10-08','the pinned strip leaves its underlying date hit target accessible');
 measurements.denseWhileEditing={scroll:calendar.scrollTop,strip:pinnedBounds.toJSON()};await discard();
 await bridge.postMessage({action:'verifyWindow',save:true});await restore();await drop('2026-10-03','2026-10-05');
 assert(dates()[0]==='2026-10-05'&&phaseDates()[0]==='2026-10-05'&&!!$('.rf-range-preview.is-visible'),'replanning also works inside the smaller native viewport');
 assert(document.documentElement.scrollWidth<=innerWidth+1&&document.documentElement.scrollHeight<=innerHeight+1,'the moved editor remains within the smaller native window');
 await discard();
}finally{Element.prototype.setPointerCapture=capture.set;Element.prototype.hasPointerCapture=capture.has;window.requestAnimationFrame=capture.raf;window.cancelAnimationFrame=capture.cancel;}
return {checks,measurements,appearance:matchMedia('(prefers-color-scheme:dark)').matches?'dark':'light',scope:'actual isolated native WebKit hit testing, geometry, inputs and native persistence with synthetic pointer/keyboard events. Pointer-capture bookkeeping and edge-scroll frame delivery are injected; trusted drag capture, release and frame pacing remain unverified. Explicit reminder time is preserved, not moved'};
