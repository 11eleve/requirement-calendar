// Exercise actual WebKit scroll/focus behavior in the isolated native application.
const checks=[], $=s=>document.querySelector(s), $$=s=>Array.from(document.querySelectorAll(s));
const assert=(value,message)=>{if(!value)throw new Error(message);checks.push(message);};
// Static layout/focus checks complete animation endpoints; no display-frame measurement.
const settle=async()=>{document.getAnimations().forEach(a=>a.finish());await new Promise(resolve=>setTimeout(resolve,30));document.getAnimations().forEach(a=>a.finish());};
const item={id:'navigation',title:'资料较多的需求',start:'2026-11-01',end:'2026-11-30',phases:[{name:'开发',start:'2026-11-01',end:'2026-11-30'}],resources:Array.from({length:18},(_,i)=>({name:'接口资料 '+i,type:'接口约定',url:'https://example.com/'+i})),tasks:[],done:[],note:''};
const restore=async value=>{assert(await CalendarApp.restoreSnapshot(JSON.stringify({version:6,anchor:'2026-11-01',requirements:[value]})),'isolated navigation fixture restored');await settle();};
const manage=async()=>{CalendarApp.openRequirement('navigation');await settle();$$('.rf-text-button').find(x=>x.textContent==='管理').click();await settle();};
const resourceSection=()=>$$('.rf-editor-section').find(x=>x.querySelector('h3').textContent==='相关资料');
await restore(item);await manage();
assert(resourceSection().contains(document.activeElement)&&document.activeElement.tagName==='SUMMARY','manage resources lands on the first resource without expanding every item');
const bounds=document.activeElement.getBoundingClientRect();
assert(bounds.top>=$('#rf-panel').getBoundingClientRect().top-1&&bounds.bottom<=$('.rf-form-actions').getBoundingClientRect().top+1,'the resource target is visible between the sticky navigation and actions');
assert(!CalendarApp.hasUnsavedChanges(),'targeting resources does not change the requirement');
const panel=$('#rf-panel');panel.scrollTop=260;const before=panel.scrollTop;
assert(!$('.rf-editor-tabs')&&!$('[data-editor-panel=basic]').hidden&&!$('[data-editor-panel=phases]').hidden,'all content remains accessible in one scrolling form');
assert(before>0&&panel.scrollTop===before,'reading resources preserves the unified editor scroll');
await CalendarApp.command('close');await settle();
await restore({...item,resources:[]});await manage();
assert(document.activeElement.textContent==='添加资料'&&resourceSection().contains(document.activeElement),'empty resources focus the available add action');
assert(!CalendarApp.hasUnsavedChanges()&&!!$('.rf-range-preview.is-visible'),'resource navigation retains the date strip and a clean draft');
return {checks,appearance:matchMedia('(prefers-color-scheme:dark)').matches?'dark':'light',scope:'actual WebKit focus, keyboard handler and scroll behavior; isolated native data'};
