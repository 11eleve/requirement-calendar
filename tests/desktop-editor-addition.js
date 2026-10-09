// Adding to a long collection must focus a visible field without scrolling the calendar.
const checks=[], $=s=>document.querySelector(s), $$=s=>Array.from(document.querySelectorAll(s));
const assert=(value,message)=>{if(!value)throw new Error(message);checks.push(message);};
const settle=async()=>{document.getAnimations().forEach(a=>a.finish());await new Promise(resolve=>setTimeout(resolve,30));document.getAnimations().forEach(a=>a.finish());};
const set=(node,value)=>{node.value=value;node.dispatchEvent(new Event('input',{bubbles:true}));};
const item={id:'addition',title:'认证服务长周期排期',tone:'blue',start:'2026-11-01',end:'2026-11-30',phases:Array.from({length:18},(_,i)=>({name:'阶段 '+i,start:CalendarModel.add('2026-11-01',i),end:CalendarModel.add('2026-11-01',i)})),resources:Array.from({length:18},(_,i)=>({name:'接口资料 '+i,type:'接口约定',url:''})),tasks:Array.from({length:18},(_,i)=>'验收事项 '+i),done:Array.from({length:18},(_,i)=>i%3===0),note:'原有备忘'};
const others=Array.from({length:13},(_,i)=>({id:'overlap-'+i,title:'并行需求 '+i,start:item.start,end:item.end,phases:[],resources:[],tasks:[],done:[],note:''}));
const measurements=[];
async function exercise(kind,size){
 if(!await CalendarApp.restoreSnapshot(JSON.stringify({version:6,anchor:'2026-11-01',requirements:[item,...others]})))throw Error('fixture restore failed');
 CalendarApp.editRequirement(item.id);await settle();
 const calendar=$('#rf-calendar');calendar.scrollTop=240;const calendarScroll=calendar.scrollTop,original=CalendarApp.exportSnapshot(),baseline=JSON.parse(original).requirements.find(value=>value.id===item.id);
 const add=$$('button').find(node=>node.textContent==='添加'+kind);add.scrollIntoView({block:'center'});add.click();await settle();
 const target=document.activeElement,bounds=target.getBoundingClientRect(),top=$('#rf-panel').getBoundingClientRect().top,bottom=$('.rf-form-actions').getBoundingClientRect().top;
 assert(target.matches('input[type=text]')&&target.value===''&&bounds.top>=top-1&&bounds.bottom<=bottom+1,size+' '+kind+': the newly added name is focused and visible between the panel top and save actions');
 assert(calendarScroll>0&&calendar.scrollTop===calendarScroll&&CalendarApp.exportSnapshot()===original&&CalendarApp.hasUnsavedChanges()&&!!$('.rf-range-preview.is-visible'),size+' '+kind+': adding keeps the calendar position, saved data and persistent draft strip');
 const row=target.closest('.rf-editor-item,.rf-task-edit');
 if(kind!=='事项')assert(row.querySelector('details').open&&Array.from(row.closest('[data-editor-panel]').querySelectorAll('details[open]')).length===1,size+' '+kind+': only the newly added collection row is expanded');
 set(target,'新增'+kind);
 if(kind==='阶段'){const dates=Array.from(row.querySelectorAll('input[type=date]'));set(dates[0],'2026-11-20');set(dates[1],'2026-11-21');}
 if(kind==='资料'){const fields=Array.from(row.querySelectorAll('input[type=text]'));set(fields[1],'接口约定');set(row.querySelector('input[type=url]'),'https://example.com/new-reference');}
 assert(await CalendarApp.command('save'),size+' '+kind+': the new entry saves through native persistence');await settle();
 const saved=JSON.parse(CalendarApp.exportSnapshot()).requirements.find(value=>value.id===item.id),key=kind==='阶段'?'phases':kind==='资料'?'resources':'tasks';
 const prefix=JSON.stringify(saved[key].slice(0,18))===JSON.stringify(baseline[key]);
 const correct=kind==='阶段'?saved.phases[18].name==='新增阶段'&&saved.phases[18].start==='2026-11-20'&&saved.phases[18].end==='2026-11-21':kind==='资料'?saved.resources[18].name==='新增资料'&&saved.resources[18].type==='接口约定'&&saved.resources[18].url==='https://example.com/new-reference':saved.tasks[18]==='新增事项'&&!saved.done[18]&&JSON.stringify(saved.done.slice(0,18))===JSON.stringify(item.done);
 assert(saved[key].length===19&&prefix&&correct&&saved.note===item.note,size+' '+kind+': saved new content preserves all earlier entries and their associations');
 assert(!CalendarApp.hasUnsavedChanges()&&!$('.rf-range-preview.is-visible'),size+' '+kind+': successful save returns to clean details and clears the temporary strip');
 measurements.push({kind,size,top:bounds.top,bottom:bounds.bottom,panelTop:top,footerTop:bottom});await CalendarApp.command('close');await settle();
}
for(const kind of ['资料','阶段','事项'])await exercise(kind,'default');
const frame=await webkit.messageHandlers.calendar.postMessage({action:'verifyWindow',save:true});await settle();
assert(frame.width===980&&frame.height===700,'addition is checked in the smaller native window');
for(const kind of ['资料','阶段','事项'])await exercise(kind,'small');
assert(document.documentElement.scrollHeight<=innerHeight+1&&document.documentElement.scrollWidth<=innerWidth+1,'long-list additions do not cause document overflow');
return {checks,measurements,appearance:matchMedia('(prefers-color-scheme:dark)').matches?'dark':'light',scope:'actual isolated native WebKit geometry, activeElement and persistence using synthetic button/input actions; no trusted pointer or motion evidence'};
