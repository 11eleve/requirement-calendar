// Keep detail actions reachable while reading long content, without covering focused controls.
const checks=[], measurements=[], $=s=>document.querySelector(s), $$=s=>Array.from(document.querySelectorAll(s));
const assert=(value,message)=>{if(!value)throw new Error(message);checks.push(message);};
const settle=async()=>{document.getAnimations().forEach(a=>a.finish());await new Promise(resolve=>setTimeout(resolve,30));document.getAnimations().forEach(a=>a.finish());};
const item={id:'actions',title:'认证链路改造与多端回归',tone:'blue',start:'2026-10-01',end:'2026-10-31',phases:[{name:'开发与回归',start:'2026-10-01',end:'2026-10-31'}],resources:Array.from({length:18},(_,i)=>({name:'接口资料 '+i,type:'文档',url:'https://example.com/'+i})),tasks:Array.from({length:12},(_,i)=>'回归事项 '+i),done:Array(12).fill(false),note:'保留评审结论。'};
const others=Array.from({length:13},(_,i)=>({id:'parallel-'+i,title:'并行需求 '+i,start:item.start,end:item.end,phases:[],resources:[],tasks:[],done:[],note:''}));
assert(await CalendarApp.restoreSnapshot(JSON.stringify({version:6,anchor:'2026-10-01',requirements:[item,...others]})),'isolated long-detail fixture restored');CalendarApp.openRequirement(item.id);await settle();
const panel=$('#rf-panel'),calendar=$('#rf-calendar');
const hit=node=>{const bounds=node.getBoundingClientRect();return document.elementFromPoint(bounds.x+bounds.width/2,bounds.y+bounds.height/2)?.closest('button,a,input')===node;};
const visible=node=>{const bounds=node.getBoundingClientRect(),viewport=panel.getBoundingClientRect();return bounds.top>=viewport.top-1&&bounds.bottom<=viewport.bottom+1;};
const edit=()=>$('.rf-detail-actions .rf-button');
async function checkPositions(size){
 assert(panel.scrollHeight>panel.clientHeight*2,size+': the fixture requires substantial detail scrolling');
 calendar.scrollTop=240;const calendarScroll=calendar.scrollTop;
 for(const [label,value] of [['top',0],['middle',panel.scrollHeight/2],['bottom',panel.scrollHeight]]){
  panel.scrollTop=value;await settle();
  assert(visible($('.rf-detail-actions'))&&$$('.rf-detail-actions button').every(hit),size+' '+label+': edit and delete actions remain visible and independently hittable');
  const actions=$('.rf-detail-actions').getBoundingClientRect(),button=edit().getBoundingClientRect();measurements.push({size,position:label,panelBottom:panel.getBoundingClientRect().bottom,actionTop:actions.top,actionBottom:actions.bottom,editBottom:button.bottom});
 }
 assert(calendarScroll>0&&calendar.scrollTop===calendarScroll,size+': reading details preserves the independent calendar position');
 const link=$$('.rf-resource-row').at(-1);link.focus();await settle();
 assert(document.activeElement===link&&visible(link)&&link.getBoundingClientRect().bottom<=$('.rf-detail-actions').getBoundingClientRect().top-3&&hit(link),size+': focusing a deep resource keeps its complete row above the action area');
 const check=$$('.rf-task input').at(-1);check.focus();await settle();
 assert(document.activeElement===check&&check.closest('label').getBoundingClientRect().bottom<=$('.rf-detail-actions').getBoundingClientRect().top-3&&hit(check),size+': focusing a deep task retains an unobscured checkbox');
}
await checkPositions('default');
const checkbox=$$('.rf-task input').at(-1),beforeToggle=panel.scrollTop;checkbox.click();
const deadline=Date.now()+10000;while(CalendarApp.isSaving()&&Date.now()<deadline)await new Promise(resolve=>setTimeout(resolve,20));await settle();
assert(!CalendarApp.isSaving()&&JSON.parse(CalendarApp.exportSnapshot()).requirements.find(value=>value.id===item.id).done[11]&&panel.scrollTop===beforeToggle,'a visible task still saves completion without changing the reading position');
const resourceSection=$$('.rf-section')[1];resourceSection.scrollIntoView({block:'start'});await settle();const originalScroll=panel.scrollTop;
edit().click();await settle();assert(!!$('.rf-form')&&!!$('.rf-range-preview.is-visible'),'the pinned edit action opens the existing editor with its persistent date strip');
$$('.rf-form-actions button').find(node=>node.textContent==='取消').click();await settle();
assert(Math.abs(panel.scrollTop-originalScroll)<=1&&document.activeElement===edit()&&visible(edit()),'cancelling returns to the same detail reading position and visible edit action');
assert($$('.rf-resource-row').length===18&&$$('.rf-task').length===12,'pinning actions does not hide or collapse requirement content');
await webkit.messageHandlers.calendar.postMessage({action:'verifyWindow',save:true});await settle();await checkPositions('small');
assert(document.documentElement.scrollHeight<=innerHeight+1&&document.documentElement.scrollWidth<=innerWidth+1,'the smaller native window retains internal scrolling without page overflow');
await CalendarApp.command('close');
assert(await CalendarApp.restoreSnapshot(JSON.stringify({version:6,anchor:'2026-10-01',requirements:[{...item,resources:[],phases:[],tasks:[],done:[],note:''}]})),'isolated short-detail fixture restored');CalendarApp.openRequirement(item.id);await settle();
assert(panel.scrollHeight<=panel.clientHeight+1&&$('#rf-detail').getBoundingClientRect().bottom<$('#rf-calendar').getBoundingClientRect().bottom-20&&visible($('.rf-detail-actions')),'short details keep their natural height and visible actions without a large empty panel');
return {checks,measurements,appearance:matchMedia('(prefers-color-scheme:dark)').matches?'dark':'light',viewport:[innerWidth,innerHeight],scope:'actual isolated native WebKit scroll, hit testing, activeElement and task persistence with synthetic activation; not trusted pointer or motion evidence'};
