// Representative dropped-plan draft, rendered in the actual isolated native host.
const $=s=>document.querySelector(s),$$=s=>Array.from(document.querySelectorAll(s));
const item={id:'replan-example',title:'认证服务迁移与灰度发布',tone:'blue',start:'2026-10-08',end:'2026-10-22',phases:[{name:'方案评审',start:'2026-10-08',end:'2026-10-10'},{name:'开发与联调',start:'2026-10-12',end:'2026-10-19'},{name:'灰度验证',start:'2026-10-20',end:'2026-10-22'}],resources:[{name:'认证服务接口约定',type:'接口文档',url:'https://example.com/auth'},{name:'灰度发布方案与回滚条件',type:'评审记录',url:''}],tasks:['确认旧版客户端兼容范围','记录灰度监控与回滚阈值'],done:[true,false],note:'保留原有阶段间隙，发布前检查错误率与重试监控。'};
if(!await CalendarApp.restoreSnapshot(JSON.stringify({version:6,anchor:'2026-10-01',requirements:[item]})))throw Error('fixture restore failed');
const cell=date=>$$('.rf-date').find(n=>n.dataset.date===date),start=cell('2026-10-09'),target=cell('2026-10-12'),bar=start.closest('.rf-week').querySelector('.rf-bar');
const from=start.getBoundingClientRect(),to=target.getBoundingClientRect(),band=bar.getBoundingClientRect();
const send=(type,x,y)=>bar.dispatchEvent(new PointerEvent(type,{pointerId:83,isPrimary:true,button:0,bubbles:true,cancelable:true,clientX:x,clientY:y}));
const capture={set:Element.prototype.setPointerCapture,has:Element.prototype.hasPointerCapture};
try{Element.prototype.setPointerCapture=()=>{};Element.prototype.hasPointerCapture=()=>false;send('pointerdown',from.left+from.width/2,band.top+band.height/2);send('pointermove',to.left+to.width/2,to.top+50);send('pointerup',to.left+to.width/2,to.top+50);}finally{Element.prototype.setPointerCapture=capture.set;Element.prototype.hasPointerCapture=capture.has;}
document.getAnimations().forEach(a=>a.finish());await new Promise(resolve=>setTimeout(resolve,30));document.getAnimations().forEach(a=>a.finish());document.activeElement?.blur();
const dates=$$('[data-editor-panel=basic] input[type=date]').map(n=>n.value),phases=$$('[data-editor-panel=phases] input[type=date]').map(n=>n.value),saved=JSON.parse(CalendarApp.exportSnapshot()).requirements[0];
if(dates.join(',')!=='2026-10-11,2026-10-25'||phases.join(',')!=='2026-10-11,2026-10-13,2026-10-15,2026-10-22,2026-10-23,2026-10-25'||saved.start!==item.start||!CalendarApp.hasUnsavedChanges())throw Error('dropped draft differs from the complete three-day shift');
const strips=$$('.rf-range-preview.is-visible').map(n=>n.getBoundingClientRect().toJSON());
if(!strips.length||strips.some(r=>r.height!==3))throw Error('draft range strips missing');
const browserStorageChecks=[];
if(!window.webkit?.messageHandlers?.calendar){
 const set=Storage.prototype.setItem;
 try{Storage.prototype.setItem=function(key,value){if(key===CalendarStorage.KEY)throw Error('isolated browser replan failure');return set.call(this,key,value);};if(await CalendarApp.command('save')||!CalendarApp.hasUnsavedChanges()||JSON.parse(CalendarApp.exportSnapshot()).requirements[0].start!==item.start)throw Error('browser failure lost the original plan or moved draft');browserStorageChecks.push('quota failure retains the original plan and moved draft');}finally{Storage.prototype.setItem=set;}
 if(!await CalendarApp.command('save'))throw Error('browser replan retry failed');
 const stored=JSON.parse(localStorage.getItem(CalendarStorage.KEY)).requirements[0];
 if(stored.start!==dates[0]||stored.end!==dates[1]||stored.phases[2].end!==phases[5]||CalendarApp.hasUnsavedChanges())throw Error('browser retry did not persist the complete shifted plan');
 browserStorageChecks.push('retry persists the shifted period and phases in localStorage');
}
return {dates,phases,savedPeriod:[saved.start,saved.end],strips,browserStorageChecks,scope:browserStorageChecks.length?'actual isolated native WebKit using the browser localStorage adapter, synthetic drag and injected quota failure/retry':'actual isolated native WebKit screenshot of the unsaved dropped-plan draft; synthetic pointer events with capture bookkeeping stubbed and animations completed; not a trusted drag recording'};
