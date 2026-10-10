// Wheel dispatch exercises the actual WebKit listener, geometry and native store.
// Synthetic wheel events do not perform the browser's native scrolling default.
const checks=[],$=selector=>document.querySelector(selector),calendar=$('#rf-calendar');
const assert=(value,message)=>{if(!value)throw Error(message);checks.push(message);};
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const snapshot=()=>JSON.parse(CalendarApp.exportSnapshot()),month=()=>snapshot().anchor.slice(0,7);
const settle=async()=>{const deadline=Date.now()+4000;while(CalendarApp.isSaving()&&Date.now()<deadline)await pause(10);await pause(20);document.getAnimations().forEach(animation=>animation.finish());};
const burst=()=>pause(270);
const wheel=(deltaY,options={},target=calendar)=>{const event=new WheelEvent('wheel',{bubbles:true,cancelable:true,deltaY,...options});target.dispatchEvent(event);return event.defaultPrevented;};
const restore=async(anchor='2026-10-01',requirements=[])=>{assert(await CalendarApp.restoreSnapshot(JSON.stringify({version:6,anchor,requirements})),'restore '+anchor);await settle();await burst();};
await restore();
assert(calendar.scrollHeight<=calendar.clientHeight+1,'empty native month fits in the viewport');
wheel(20);await settle();assert(month()==='2026-10','a small accidental movement does not flip');
wheel(40);assert(month()==='2026-11','downward trackpad deltas accumulate to the next month');
// Deliver momentum while the asynchronous native commit is still in flight.
for(let i=0;i<12;i++){wheel(100);await pause(30);}
await settle();assert(month()==='2026-11','continuous trackpad momentum cannot skip additional months; actual '+month());
await burst();wheel(-3,{deltaMode:1});await settle();assert(month()==='2026-10','line-mode mouse wheel returns to the previous month');
await burst();wheel(-1,{deltaMode:2});await settle();assert(month()==='2026-09','page-mode wheels also navigate');
await burst();wheel(20);wheel(-20);wheel(40);await settle();assert(month()==='2026-09','reversing direction resets the movement threshold');
await burst();
assert(!wheel(200,{deltaX:300}),'horizontal gestures keep their native behavior');
for(const modifier of ['ctrlKey','metaKey','shiftKey','altKey'])assert(!wheel(200,{[modifier]:true}),modifier+' is not captured');
await settle();assert(month()==='2026-09','horizontal and modified gestures do not change month');
const dense=Array.from({length:14},(_,i)=>({id:'dense-'+i,title:'需求 '+i,tone:'blue',start:'2026-09-01',end:'2026-11-30',phases:[],resources:i===0?Array.from({length:18},(_,index)=>({name:'资料 '+index,type:'接口约定',url:''})):[],tasks:[],done:[],note:''}));
await restore('2026-10-01',dense);const requirements=JSON.stringify(snapshot().requirements);
calendar.scrollTop=500;
assert(!wheel(120),'scrolling inside dense content keeps native scrolling enabled');
await settle();assert(month()==='2026-10','interior scrolling does not turn the month');
calendar.scrollTop=calendar.scrollHeight;
await burst();assert(wheel(100),'the bottom edge consumes the month-switch gesture');await settle();
assert(month()==='2026-11'&&calendar.scrollTop===0,'downward navigation starts the next month at its beginning');
calendar.scrollTop=0;await burst();wheel(-100);await settle();
assert(month()==='2026-10'&&Math.abs(calendar.scrollTop-(calendar.scrollHeight-calendar.clientHeight))<2,'upward navigation resumes at the previous month end');
assert(JSON.stringify(snapshot().requirements)===requirements,'wheel navigation preserves all requirement data');
CalendarApp.editRequirement('dense-0');await settle();
const form=$('.rf-form'),name=form.querySelector('input[type=text]'),panel=$('#rf-panel');
name.value='保留未保存编辑';name.dispatchEvent(new Event('input',{bubbles:true}));
// A focused, offscreen text caret can make WebKit undo synthetic scrolling.
// Focus the visible inspector control so this check isolates month navigation.
$('#rf-close').focus({preventScroll:true});panel.scrollTop=120;await settle();const panelScroll=panel.scrollTop;
await burst();wheel(100);await settle();
assert(month()==='2026-11'&&$('.rf-form')===form&&name.value==='保留未保存编辑'&&CalendarApp.hasUnsavedChanges(),'wheel navigation preserves the unsaved editor');
assert(panel.scrollTop===panelScroll,'month navigation preserves the independent editor scroll position; '+panelScroll+' -> '+panel.scrollTop);
await burst();wheel(100,{},panel);await settle();assert(month()==='2026-11','editor scrolling never turns the calendar');
$('#rf-title').click();await burst();wheel(100);await settle();assert(month()==='2026-11','an open month picker blocks wheel navigation');$('#rf-month-cancel').click();
await CalendarApp.command('close');assert($('#rf-discard').open,'dirty editor opens the discard confirmation');
await burst();wheel(100);await settle();assert(month()==='2026-11','a discard confirmation blocks wheel navigation');$('#rf-discard-keep').click();
await CalendarApp.command('discard');await restore('2026-10-01',dense);
calendar.scrollTop=calendar.scrollHeight;const oldScroll=calendar.scrollTop,bridge=webkit.messageHandlers.calendar,post=bridge.postMessage;
try{bridge.postMessage=async message=>{if(message.action==='save')throw Error('isolated wheel save failure');return post.call(bridge,message);};wheel(100);await settle();}finally{bridge.postMessage=post;}
assert(month()==='2026-10'&&calendar.scrollTop===oldScroll&&!$('#rf-storage-error').hidden,'failed persistence restores the month and original scroll position');
// The error banner reduces the viewport; reach the new bottom before retrying.
calendar.scrollTop=calendar.scrollHeight;await burst();wheel(100);await settle();assert(month()==='2026-11'&&$('#rf-storage-error').hidden,'a fresh gesture retries the failed navigation successfully');
await restore('2026-12-01');wheel(100);await settle();assert(month()==='2027-01','downward navigation crosses the year boundary');
await burst();wheel(-100);await settle();assert(month()==='2026-12','upward navigation crosses the year boundary');
await restore('0001-01-01');wheel(-100);await settle();assert(month()==='0001-01'&&!CalendarApp.isSaving(),'the earliest supported month is bounded');
await restore('9999-12-01');wheel(100);await settle();assert(month()==='9999-12'&&!CalendarApp.isSaving(),'the latest supported month is bounded');
await restore();await CalendarApp.command('summary');await burst();wheel(100,{},$('#rf-summary'));await settle();assert(month()==='2026-10','summary scrolling never changes the calendar month');
await CalendarApp.command('summary');
return {checks,scope:'synthetic wheel dispatch in actual native WebKit; native save and scroll geometry verified; physical trackpad feel remains manual'};
