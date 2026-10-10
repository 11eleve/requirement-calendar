// Real WebKit colors and isolated save flow. Synthetic pointer capture is stubbed;
// this does not assert trusted mouse feel or intermediate animation frames.
const checks=[], $=s=>document.querySelector(s), $$=s=>Array.from(document.querySelectorAll(s));
const assert=(value,message)=>{if(!value)throw new Error(message);checks.push(message);};
const settle=()=>{document.getAnimations().forEach(a=>a.finish());void $('#rf-calendar').offsetWidth;};
const set=(node,value)=>{node.value=value;node.dispatchEvent(new Event('input',{bubbles:true}));};
const snapshot=()=>JSON.parse(CalendarApp.exportSnapshot());
const fixture=(id,tone,start='2026-10-01',end='2026-10-31')=>({id,title:id,tone,start,end,phases:[],resources:[],tasks:[],done:[],note:''});
const restore=async items=>{if(!await CalendarApp.restoreSnapshot(JSON.stringify({version:6,anchor:'2026-10-01',requirements:items})))throw new Error('fixture restore failed');settle();};
const strip=()=>$('.rf-range-preview.is-visible');
const stripColor=()=>getComputedStyle(strip()).backgroundColor;
const matchesTone=tone=>{settle();const bar=$('.rf-bar'+(tone?'.'+tone:':not(.blue):not(.green)'));return stripColor()===getComputedStyle(bar).color;};
await restore([]);
for(let i=0;i<3;i++){
 await CalendarApp.command('new');settle();
 const before=stripColor();set($('.rf-form input[type=text]'),'真实新建 '+i);
 assert(await CalendarApp.command('save'),'new requirement '+i+' saves through native bridge');settle();
 const saved=snapshot().requirements.at(-1),bar=$('[data-requirement-id="'+saved.id+'"]');
 assert(getComputedStyle(bar).color===before&&!strip(),'saved bar '+i+' takes over the draft color and clears range strip');
}
assert(snapshot().requirements.map(r=>r.tone).join(',')===',blue,green','three user-created requirements receive distinct palette tones');
await restore([fixture('purple',''),fixture('blue','blue'),fixture('offscreen','green','2027-01-01','2027-01-02')]);
await CalendarApp.command('new');settle();
const chosen=stripColor();assert(strip().classList.contains('green'),'offscreen requirements do not bias colors for the current calendar');
for(const [node,value] of $$('.rf-form .rf-pair input').map((node,i)=>[node,i?'2027-02-01':'2026-09-28']))set(node,value);
assert(stripColor()===chosen&&$$('.rf-range-preview.is-visible').length>1,'changing dates keeps the assigned tone across visible week strips');
await CalendarApp.command('close');assert($('#rf-discard').open&&stripColor()===chosen,'unsaved-change confirmation preserves the assigned color');$('#rf-discard-drop').click();assert(!strip(),'discarding clears the draft strip');
for(const tone of ['blue','green']){
 await restore([fixture('existing',tone)]);CalendarApp.editRequirement('existing');settle();
 assert(matchesTone(tone)&&!CalendarApp.hasUnsavedChanges(),'editing '+tone+' matches the original bar without making a dirty draft');
 set($('.rf-form input[type=text]'),'保留 '+tone);await CalendarApp.command('save');
 assert(snapshot().requirements[0].tone===tone,'editing and saving preserves '+tone+' in stored data');
}
await restore([fixture('purple',''),fixture('blue','blue')]);
const originalSet=Element.prototype.setPointerCapture,originalHas=Element.prototype.hasPointerCapture;
Element.prototype.setPointerCapture=()=>{};Element.prototype.hasPointerCapture=()=>false;
const point=node=>{const r=node.getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+12};};
const send=(node,type,p)=>node.dispatchEvent(new PointerEvent(type,{pointerId:84,isPrimary:true,button:0,bubbles:true,cancelable:true,clientX:p.x,clientY:p.y}));
try{
 const from=$('.rf-date[data-date="2026-10-08"]'),to=$('.rf-date[data-date="2026-10-04"]');
 send(from,'pointerdown',point(from));const draggingColor=stripColor();
 send(from,'pointermove',point(to));settle();
 assert($$('.rf-range-preview.is-visible').length===2&&stripColor()===draggingColor,'reverse cross-week drag keeps one tone');
 send(from,'pointerup',point(to));settle();
 assert(stripColor()===draggingColor&&$$('.rf-form .rf-pair input').map(n=>n.value).join(',')==='2026-10-04,2026-10-08','drag-to-editor transition keeps color and normalized dates');
 set($('.rf-form input[type=text]'),'拖动创建');await CalendarApp.command('save');settle();
 const saved=snapshot().requirements.at(-1);
 assert(saved.tone==='green'&&getComputedStyle($('[data-requirement-id="'+saved.id+'"]')).color===draggingColor&&!strip(),'drag-created requirement retains its color after save');
}finally{Element.prototype.setPointerCapture=originalSet;Element.prototype.hasPointerCapture=originalHas;}
return {checks,appearance:matchMedia('(prefers-color-scheme:dark)').matches?'dark':'light',scope:'actual resolved WebKit colors, isolated native persistence and synthetic pointer handlers; no trusted animation measurement'};
