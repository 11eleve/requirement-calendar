// Regression cases for missed reverse gestures, edge overflow and momentum tails.
// Native WebKit geometry and persistence are real; wheel input is synthetic.
const checks=[],$=selector=>document.querySelector(selector),calendar=$('#rf-calendar');
const assert=(value,message)=>{if(!value)throw Error(message+'; '+checks.slice(-2).join(' / '));checks.push(message);};
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const month=()=>JSON.parse(CalendarApp.exportSnapshot()).anchor.slice(0,7);
const wheel=(deltaY)=>{const event=new WheelEvent('wheel',{bubbles:true,cancelable:true,deltaY});calendar.dispatchEvent(event);return event.defaultPrevented;};
const saved=async()=>{const deadline=Date.now()+4000;while(CalendarApp.isSaving()&&Date.now()<deadline)await pause(10);assert(!CalendarApp.isSaving(),'native save finishes');};
const settle=async()=>{await saved();document.getAnimations().forEach(a=>a.finish());await pause(20);};
const restore=async(requirements=[])=>{assert(await CalendarApp.restoreSnapshot(JSON.stringify({version:6,anchor:'2026-10-01',requirements})),'restore isolated October');await settle();await pause(270);};
await restore();wheel(100);await saved();
assert(!!$('.rf-month-slide-window'),'first month transition is still running');
wheel(-20);wheel(-40);await settle();
assert(month()==='2026-10','upward reversal works without waiting for silence or the previous animation');
wheel(100);await settle();assert(month()==='2026-11','downward reversal works immediately too');
await restore();
const bridge=webkit.messageHandlers.calendar,post=bridge.postMessage;
try{
 bridge.postMessage=async message=>{if(message.action==='save')await pause(160);return post.call(bridge,message);};
 wheel(100);assert(CalendarApp.isSaving(),'native anchor save is in flight');wheel(-100);
 await pause(380);await settle();assert(month()==='2026-10','a reverse gesture during an anchor save is queued and applied');
}finally{bridge.postMessage=post;}
await restore();
try{
 bridge.postMessage=async message=>{if(message.action==='save'){await pause(100);throw Error('isolated queued navigation failure');}return post.call(bridge,message);};
 wheel(100);wheel(-100);await pause(250);await settle();
 assert(month()==='2026-10'&&!$('.rf-month-slide-window'),'a failed anchor save cancels queued navigation and restores the original month');
}finally{bridge.postMessage=post;}
await restore();wheel(100);await saved();await pause(200);wheel(100);await settle();
assert(month()==='2026-12','a separate gesture can start before the old animation ends');
await restore();wheel(100);await saved();
for(const dy of [80,60,40,20,8,3,1]){await pause(20);wheel(dy);}
await settle();assert(month()==='2026-11','a decaying momentum tail stays on one month');
await pause(20);wheel(55);wheel(10);await settle();
assert(month()==='2026-12','renewed force after a decaying tail starts a fresh gesture without a long pause');
await restore();wheel(100);await saved();
for(let i=0;i<5;i++){await pause(50);wheel(.2);}
wheel(100);await settle();assert(month()==='2026-12','subpixel momentum cannot extend the lock indefinitely');
const dense=Array.from({length:14},(_,i)=>({id:'recovery-'+i,title:'需求 '+i,start:'2026-09-01',end:'2026-11-30',tasks:[],done:[],note:'',resources:[],phases:[]}));
await restore(dense);calendar.scrollTop=35;wheel(-100);await settle();
assert(month()==='2026-09','the event that reaches the top also uses its overflow to turn upward');
calendar.scrollTop=calendar.scrollHeight-calendar.clientHeight-35;wheel(100);await settle();
assert(month()==='2026-10','edge overflow works symmetrically at the bottom');
assert(calendar.scrollTop===0&&!wheel(100),'momentum can scroll dense next-month content while page turning is locked');
calendar.scrollTop=calendar.scrollHeight-calendar.clientHeight-35;wheel(100);
assert(Math.abs(calendar.scrollTop-(calendar.scrollHeight-calendar.clientHeight))<2&&month()==='2026-10','locked momentum still reaches the content edge without skipping another month');
await restore(dense);calendar.scrollTop=1.5;wheel(-60);await settle();
assert(month()==='2026-09','fractional offsets near the top do not swallow an upward gesture');
await restore(dense);calendar.scrollTop=0;wheel(-20);await settle();
assert(month()==='2026-10','small movements at an edge still need the deliberate threshold');
calendar.scrollTop=500;assert(!wheel(-100),'ordinary upward scrolling inside content remains native');
await settle();assert(month()==='2026-10','ordinary interior scrolling does not turn months');
return {checks,scope:'Synthetic wheel input in native WebKit; reverse gestures, delayed native saves, inertial tails, fresh gestures, fractional edge geometry and dense content. Physical trackpad input not measured.'};
