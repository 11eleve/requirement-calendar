// Inspect the actual moving layers and geometry in native WebKit.
const checks=[],$=selector=>document.querySelector(selector),calendar=$('#rf-calendar');
const assert=(value,message)=>{if(!value)throw Error(message+'; after '+checks.length+' checks: '+checks.slice(-2).join(' / '));checks.push(message);};
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const frame=()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
const snapshot=()=>JSON.parse(CalendarApp.exportSnapshot()),month=()=>snapshot().anchor.slice(0,7);
const wheel=(dy,options={})=>{const event=new WheelEvent('wheel',{bubbles:true,cancelable:true,deltaY:dy,...options});calendar.dispatchEvent(event);return event.defaultPrevented;};
const finish=async()=>{document.getAnimations().forEach(a=>a.finish());await pause(20);const deadline=Date.now()+4000;while(CalendarApp.isSaving()&&Date.now()<deadline)await pause(10);};
const restore=async(anchor='2026-10-01',requirements=[])=>{assert(await CalendarApp.restoreSnapshot(JSON.stringify({version:6,anchor,requirements})),'restore '+anchor+' '+document.querySelector('#rf-storage-error').textContent);await finish();await pause(270);};
const motion=()=>$('.rf-month-slide-window');
const layers=()=>Array.from(motion().querySelectorAll('.rf-month-slide-page'));
const offset=node=>node.getBoundingClientRect().top-motion().getBoundingClientRect().top;
await restore();
const old=CalendarApp.exportSnapshot(),heading=calendar.querySelector('.rf-weekdays').getBoundingClientRect().top;
assert(wheel(20),'a small edge gesture is consumed for a visual preview');await frame();
assert(month()==='2026-10'&&!CalendarApp.isSaving(),'preview movement does not change or persist the month');
assert(motion()?.inert&&motion().getAttribute('aria-hidden')==='true','visual copies are inert and hidden from accessibility');
const [outgoing,incoming]=layers(),height=motion().getBoundingClientRect().height;
assert(offset(outgoing)<0&&offset(incoming)>0,'both month bodies follow a small downward gesture');
assert(Math.abs(offset(incoming)-offset(outgoing)-height)<2,'neighboring months share one seam without a blank gap');
assert(calendar.querySelector('.rf-weekdays').getBoundingClientRect().top===heading,'weekday labels remain fixed during the preview');
const ids=Array.from(document.querySelectorAll('[id]'),n=>n.id);assert(new Set(ids).size===ids.length,'visual copies never duplicate live element IDs');
await pause(420);
assert(!motion()&&CalendarApp.exportSnapshot()===old,'an incomplete gesture springs back and leaves saved data untouched');
await pause(270);wheel(100);await frame();
assert(month()==='2026-11'&&motion(),'crossing the threshold commits the next month while preserving its transition');
const moving=layers();assert(moving.every(n=>n.parentElement.getAnimations().some(a=>a.effect.getTiming().duration>=350)),'the entire outgoing and incoming months animate over a visible interval');
await pause(80);const mid=offset(moving[0]);
assert(mid<0&&mid>-height,'the transition has an observable intermediate position');
assert(Math.abs(offset(moving[1])-mid-height)<2,'both months stay joined throughout the transition');
for(let i=0;i<8;i++)wheel(120);
assert(month()==='2026-11','momentum during the transition cannot skip a second month');
await finish();assert(!motion()&&!document.querySelector('.rf-month-slide-sheet'),'finished transitions remove both visual copies');
assert(calendar.scrollTop===0,'the real next month is already positioned at its beginning');
await pause(270);wheel(-100);await frame();
assert(offset(layers()[0])>0&&offset(layers()[1])<0,'upward navigation reverses the whole-sheet motion');await finish();
const dense=Array.from({length:14},(_,i)=>({id:'motion-'+i,title:'需求 '+i,start:'2026-09-01',end:'2026-11-30',tasks:[],done:[],note:'',resources:[],phases:[]}));
await restore('2026-10-01',dense);calendar.scrollTop=calendar.scrollHeight;const scroll=calendar.scrollTop;
wheel(20);await frame();
assert(layers()[0].querySelector('.rf-month-slide-sheet').scrollTop===scroll,'a dense outgoing month keeps the exact viewport scroll position');
await pause(420);calendar.scrollTop=0;await pause(270);wheel(-100);await frame();
const sheet=layers()[1].querySelector('.rf-month-slide-sheet');assert(Math.abs(sheet.scrollTop-(sheet.scrollHeight-sheet.clientHeight))<2,'the previous month enters from its end');await finish();
CalendarApp.editRequirement('motion-0');const form=$('.rf-form'),name=form.querySelector('input[type=text]');name.value='动画期间保留草稿';name.dispatchEvent(new Event('input',{bubbles:true}));
await pause(270);calendar.scrollTop=calendar.scrollHeight;wheel(100);await frame();await finish();
assert($('.rf-form')===form&&name.value==='动画期间保留草稿'&&CalendarApp.hasUnsavedChanges(),'the whole-month transition preserves the original dirty editor');
await CalendarApp.command('discard');await restore();wheel(20);await frame();$('#rf-title').click();
assert(!motion()&&$('#rf-month-picker').open,'opening direct month navigation cancels a preview cleanly');$('#rf-month-cancel').click();
await pause(270);wheel(100);await frame();window.dispatchEvent(new Event('resize'));
assert(!motion(),'resizing removes stale visual layers immediately');await finish();
await restore();const originalMedia=window.matchMedia;
try{window.matchMedia=query=>query==='(prefers-reduced-motion:reduce)'?{matches:true}:originalMedia.call(window,query);wheel(100);await finish();assert(month()==='2026-11'&&!motion(),'reduced motion uses direct navigation without moving copies');}finally{window.matchMedia=originalMedia;}
await restore();const animate=Element.prototype.animate;
try{Element.prototype.animate=undefined;wheel(100);await finish();assert(month()==='2026-11'&&!motion(),'missing animation support falls back to direct navigation');}finally{Element.prototype.animate=animate;}
await restore();try{Element.prototype.animate=()=>{throw Error('isolated animation failure');};wheel(100);await finish();assert(month()==='2026-11'&&!motion(),'an animation construction failure cannot break navigation or leave a cover');}finally{Element.prototype.animate=animate;}
await restore();const bridge=webkit.messageHandlers.calendar,post=bridge.postMessage;
try{bridge.postMessage=async message=>{if(message.action==='save')throw Error('isolated motion save failure');return post.call(bridge,message);};wheel(100);await finish();}finally{bridge.postMessage=post;}
assert(month()==='2026-10'&&!motion()&&!CalendarApp.isSaving(),'failed persistence rolls back the real month and removes visual layers');
return {checks,scope:'Native WebKit synthetic gestures, intermediate animation geometry, native persistence, dirty editor, reduced motion and fallback behavior. Physical trackpad feel not measured.'};
