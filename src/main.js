
window.CalendarReady=(async()=>{
 const Model=CalendarModel;
 const {el,button,field,input}=CalendarElements;
 const root=document.getElementById('req-calendar-refined'),get=id=>root.querySelector('#'+id);let today=Model.localDate();
 const baseline=[{id:'checkout',title:'结算流程改版',short:'结算改版',tone:'',start:'2026-10-07',end:'2026-11-06',phases:[{name:'评审',start:'2026-10-07',end:'2026-10-08'},{name:'开发',start:'2026-10-09',end:'2026-10-16'},{name:'联调',start:'2026-10-17',end:'2026-10-23'},{name:'测试',start:'2026-10-24',end:'2026-10-30'},{name:'上线',start:'2026-10-31',end:'2026-11-06'}],resources:[{icon:'钉',name:'结算改版 PRD',type:'需求文档',url:''},{icon:'F',name:'Checkout 交互与视觉',type:'设计稿',url:''}],tasks:['确认需求边界与验收标准','实现优惠券选择与金额计算','补齐支付失败恢复逻辑','联调与回归验证'],done:[true,false,false,false],note:'待产品确认：优惠券与余额的扣减顺序。'},{id:'login',title:'登录态异常修复',short:'登录修复',tone:'blue',start:'2026-10-09',end:'2026-10-13',phases:[{name:'排查',start:'2026-10-09',end:'2026-10-10'},{name:'修复',start:'2026-10-11',end:'2026-10-12'},{name:'验证',start:'2026-10-13',end:'2026-10-13'}],resources:[{icon:'钉',name:'登录失效场景整理',type:'问题记录',url:''},{icon:'G',name:'认证模块设计',type:'接口约定',url:''}],tasks:['定位状态不同步','修复与回归验证','发布与观察'],done:[false,false,false],note:'确认自动续期失败后是否强制退出。'},{id:'export',title:'报表导出优化',short:'报表优化',tone:'green',start:'2026-10-19',end:'2026-10-30',phases:[{name:'方案',start:'2026-10-19',end:'2026-10-20'},{name:'开发',start:'2026-10-21',end:'2026-10-26'},{name:'验收',start:'2026-10-27',end:'2026-10-30'}],resources:[{icon:'钉',name:'异步导出说明',type:'需求文档',url:''},{icon:'F',name:'导出任务面板',type:'交互设计',url:''}],tasks:['确认导出规模与边界','实现任务状态展示','联调与验收'],done:[false,false,false],note:'等待后端确认导出任务状态与重试接口。'}];
 let requirements=window.__calendarDemo?structuredClone(baseline).map(item=>{const shift=date=>Model.add(today,Model.days('2026-10-07',date));return {...item,start:shift(item.start),end:shift(item.end),phases:item.phases.map(phase=>({...phase,start:shift(phase.start),end:shift(phase.end)}))};}):[],state={view:'month',anchor:today,selected:null,rowHeight:136},lastTrigger=null,draftPreview=null,editor=null,pendingAction=null,deleted=null,saving=false,queuedNotification=null,discardPosition=null,discardRestoreFrame=null,exporting=false;
 requirements=requirements.map(Model.requirement);
 const {parse,iso,add,days,format,validDate}=Model,req=id=>requirements.find(r=>r.id===id);
 let monthMotion=null;
 let dateSelection=null,barSelection=null,cancelledDatePointer=null,suppressDateClickUntil=0,replanFrame=0;
 function applyTone(node,tone,context='bar'){
  const value=Model.TONES.find(value=>value.id===tone)||Model.TONES[0];
  if(context==='range'){node.style.setProperty('--rf-range-tone',value.color);return;}
  for(const [key,color] of Object.entries(context==='detail'?{'--rf-context-tone':value.color,'--rf-context-fill':value.fill,'--rf-action':value.color,'--rf-action-hover':value.color,'--rf-on-action':'#fff'}:{'--rf-tone':value.color,'--rf-fill':value.fill,'--rf-phase-fill':value.stage}))node.style.setProperty(key,color);
 }
 function nodeKind(node){return Model.NODE_KINDS.find(kind=>kind.id===node.kind);}
 const removeButton=(kind,name,action)=>{const control=button('rf-remove','',null,action);control.append(get('rf-close').querySelector('svg').cloneNode(true));const label=()=>{control.title='移除'+kind+'：'+(name.value.trim()||'未命名'+kind);control.setAttribute('aria-label',control.title);};name.addEventListener('input',label);label();return control;};
 const revealEditorControl=control=>{
  control.scrollIntoView({block:'nearest'});
  const panel=get('rf-panel'),bounds=control.getBoundingClientRect(),top=panel.getBoundingClientRect().top+12,bottom=panel.querySelector('.rf-form-actions,.rf-detail-actions')?.getBoundingClientRect().top-12;
  if(bounds.top<top)panel.scrollTop-=top-bounds.top;
  else if(bottom&&bounds.bottom>bottom)panel.scrollTop+=bounds.bottom-bottom;
 };
 const focusEditorControl=control=>{control.focus({preventScroll:true});revealEditorControl(control);};
 let commandVersion=0;const commandSession=Model.newId();
 let storage=null;try{storage=window.localStorage;}catch{}
 const legacyKey='codex:visualization-widget-state-v2:'+JSON.stringify([window.location.pathname,window.location.search]);
 const browserStore=CalendarStorage.createStore(storage,{legacyKey}),nativeBridge=window.CalendarDesktop||window.webkit?.messageHandlers?.calendar;
 const siteIcons=CalendarSiteIcons.create(nativeBridge);
 const store=nativeBridge?CalendarStorage.createNativeStore(nativeBridge,browserStore):browserStore;
 function showStorageIssue(issue){const node=get('rf-storage-error');node.hidden=!issue;node.textContent=issue||'';}
 function setReminderIssue(issue){const node=get('rf-reminder-status');node.hidden=!issue;node.textContent=issue||'';}
 const restored=await store.load();if(restored.data){requirements=restored.data.requirements;state.anchor=restored.data.anchor;}showStorageIssue(restored.issue);
 async function save(next=requirements,recovery=false){const result=await store.save({version:Model.VERSION,anchor:state.anchor,requirements:next},recovery);showStorageIssue(result.issue);setReminderIssue(result.reminderIssue);if(result.ok)commandVersion++;return result.ok;}
 function disposeDisclosures(){if(discardRestoreFrame!==null){cancelAnimationFrame(discardRestoreFrame);discardRestoreFrame=null;}get('rf-panel').querySelectorAll('.rf-disclosure,.rf-reminder-editor').forEach(CalendarDisclosure.dispose);}
 function openPanel(label,trigger,tone=''){if(saving)return;cancelMonthMotion();cancelCalendarGesture();disposeDisclosures();if(trigger&&!get('rf-detail').contains(trigger))lastTrigger=trigger;else if(!root.classList.contains('has-detail'))lastTrigger=document.activeElement;editor=null;root.classList.add('has-detail');get('rf-detail').dataset.tone=tone;applyTone(get('rf-detail'),tone,'detail');get('rf-detail').hidden=false;get('rf-panel-label').textContent=label;get('rf-panel').replaceChildren();get('rf-panel').scrollTop=0;}
 function selectRequirement(id){state.selected=id;for(const bar of root.querySelectorAll('.rf-bar,.rf-summary-row,.rf-summary-node')){const selected=bar.dataset.requirementId===id;bar.classList.toggle('is-selected',selected);bar.setAttribute('aria-expanded',String(selected));bar.setAttribute('aria-controls','rf-detail');}}
 let calendarFocus=null;
 function closePanel(force=false){if(saving)return;if(!force&&!mayLeave(()=>closePanel(true)))return;cancelCalendarGesture();editor=null;disposeDisclosures();clearDraftPreview();root.classList.remove('has-detail');get('rf-detail').hidden=true;selectRequirement(null);let target=lastTrigger?.isConnected&&root.contains(lastTrigger)&&!get('rf-detail').contains(lastTrigger)&&!lastTrigger.disabled?lastTrigger:null;if(state.view==='summary'&&!target){const selector=lastTrigger?.classList.contains('rf-summary-node')?'.rf-summary-node':'.rf-summary-row';target=Array.from(get('rf-summary').querySelectorAll(selector)).find(node=>node.dataset.requirementId===lastTrigger?.dataset.requirementId&&node.dataset.nodeId===lastTrigger?.dataset.nodeId);if(!target)target=Array.from(get('rf-summary').querySelectorAll('.rf-summary-row')).find(node=>node.dataset.requirementId===lastTrigger?.dataset.requirementId);if(!target){target=get('rf-summary').querySelector('[data-summary-control=query]');get('rf-summary').scrollTop=0;}}target??=get('rf-title');target.focus({preventScroll:true});}
 function makeWeek(start,allocation,anchor=state.anchor){const end=boundedAdd(start,6)||'9999-12-31',week=el('div','rf-week'),dateGrid=el('div','rf-days'),bars=el('div','rf-bars');for(let i=0;i<7;i++){const date=boundedAdd(start,i);if(!date){const blank=el('div','rf-date outside');blank.setAttribute('aria-hidden','true');dateGrid.append(blank);continue;}const outside=date.slice(0,7)!==anchor.slice(0,7);const isToday=date===today,dateButton=button('rf-date'+(outside?' outside':'')+(isToday?' is-today':''),'',date+(isToday?' 今天，':' ')+'新建需求',()=>edit(null,date));dateButton.dataset.date=date;if(isToday)dateButton.setAttribute('aria-current','date');dateButton.tabIndex=date===calendarFocus.date?0:-1;const label=el('span','rf-date-label');label.append(el('span','rf-date-number',String(Number(date.slice(8)))));dateButton.append(label);dateGrid.append(dateButton);}for(const r of requirements){if(r.start>end||r.end<start)continue;const a=r.start<start?start:r.start,b=r.end>end?end:r.end,length=days(a,b)+1;const bar=button('rf-bar '+(r.tone||'')+(r.start<start?' continued-left':'')+(r.end>end?' continued-right':''),'',r.title+'，'+r.start+' 至 '+r.end,e=>detail(r.id,e.currentTarget,false,null,e.target.closest('.rf-node-marker')?.dataset.nodeId));applyTone(bar,r.tone);bar.style.gridColumn=(days(start,a)+1)+' / span '+length;bar.style.gridRow=String(allocation.mapping[r.id]+1);bar.style.setProperty('--rf-days',length);bar.dataset.tooltip=r.title+' · '+rangeText(r.start,r.end);bar.title=bar.dataset.tooltip+' · 拖动调整排期';bar.dataset.requirementId=r.id;bar.setAttribute('aria-label',bar.getAttribute('aria-label')+(r.phases.length?'；'+r.phases.map(p=>p.name+' '+p.start+' 至 '+p.end).join('；'):''));bar.append(el('span','rf-bar-title',r.short||r.title));const track=el('span','rf-phases');for(const phase of r.phases){if(phase.start>b||phase.end<a)continue;const pa=phase.start<a?a:phase.start,pb=phase.end>b?b:phase.end;const segment=el('span','rf-phase'+(r.phases.indexOf(phase)%2?' phase-alt':'')+(phase.start<=today&&phase.end>=today?' is-current':''),phase.name);segment.style.gridColumn=(days(a,pa)+1)+' / span '+(days(pa,pb)+1);segment.dataset.tooltip=phase.name+' · '+rangeText(phase.start,phase.end);segment.title=segment.dataset.tooltip;track.append(segment);}bar.classList.toggle('has-phases',track.childElementCount>0);bar.append(track);const nodes=r.milestones.filter(node=>node.date>=a&&node.date<=b),byDate=new Map();for(const node of nodes){if(!byDate.has(node.date))byDate.set(node.date,[]);byDate.get(node.date).push(node);}for(const [date,group] of byDate){const marker=el('span','rf-node-marker'+(group.every(node=>node.done)?' is-done':''));marker.classList.toggle('is-overdue',date<today&&group.some(node=>!node.done));marker.dataset.nodeId=(group.find(node=>!node.done)||group[0]).id;marker.style.left=((days(a,date)+.5)/length*100)+'%';marker.append(el('span','rf-node-symbol',group.length>1?String(group.length):nodeKind(group[0]).symbol));marker.title=group.map(node=>nodeKind(node).name+' · '+node.name+' · '+node.date+(node.done?' · 已完成':node.date<today?' · 已过计划日期':'')).join('\n');marker.setAttribute('aria-label',marker.title);bar.append(marker);}bar.setAttribute('aria-label',bar.getAttribute('aria-label')+(nodes.length?'；节点：'+nodes.map(node=>nodeKind(node).name+' '+node.name+' '+node.date+(node.done?' 已完成':'')).join('；'):''));bars.append(bar);}week.style.setProperty('--rf-lanes',Math.max(0,...Array.from(bars.children,bar=>Number(bar.style.gridRow)+0)));week.append(dateGrid,bars);return week;}
 function boundedAdd(date,delta){try{return add(date,delta);}catch{return null;}}
 function fillMonth(host,anchor){
  const grid=Model.monthGrid(anchor);let previous=null,peak=0;const heading=el('div','rf-weekdays');
  for(const day of ['一','二','三','四','五','六','日'])heading.append(el('span','','周'+day));host.append(heading);
  for(let i=0;i<grid.count;i++){const start=add(grid.start,i*7),allocation=Model.allocateLanes(requirements,start,boundedAdd(start,6)||'9999-12-31',previous);host.append(makeWeek(start,allocation,anchor));previous=allocation.mapping;peak=Math.max(peak,allocation.count);}
  return peak;
 }
 function render(preserveMotion=false){
  if(!preserveMotion)cancelMonthMotion();cancelCalendarGesture();
  if(!calendarFocus||calendarFocus.month!==state.anchor.slice(0,7))calendarFocus={month:state.anchor.slice(0,7),date:state.anchor};
  const calendar=get('rf-calendar');calendar.replaceChildren();root.style.setProperty('--rf-row-height',state.rowHeight+'px');
  root.style.setProperty('--rf-lanes',fillMonth(calendar,state.anchor));const d=parse(state.anchor);
  get('rf-title').replaceChildren(el('span','rf-month-year',d.getUTCFullYear()+' 年 '),el('span','rf-month-name',(d.getUTCMonth()+1)+' 月'));
  get('rf-title').setAttribute('aria-label','跳转月份，当前 '+d.getUTCFullYear()+' 年 '+(d.getUTCMonth()+1)+' 月');
  selectRequirement(state.selected);if(draftPreview)paintDateSelection(draftPreview);if(state.view==='summary')renderSummary();
 }
 // The live calendar keeps its scroll geometry and event listeners. Two inert
 // visual copies cover only its body while the weekday heading stays fixed.
 function cancelMonthMotion(){
  const motion=monthMotion;if(!motion)return;monthMotion=null;clearTimeout(motion.timer);
  for(const animation of motion.animations)animation.cancel();motion.window.remove();root.classList.remove('is-month-moving');
 }
 function monthMotionAllowed(){return !matchMedia('(prefers-reduced-motion:reduce)').matches&&typeof Element.prototype.animate==='function'&&!document.hidden;}
 function beginMonthMotion(direction,next){
  cancelMonthMotion();if(!monthMotionAllowed()||state.view!=='month')return null;
  const calendar=get('rf-calendar'),content=get('rf-calendar').parentElement,rect=calendar.getBoundingClientRect(),contentRect=content.getBoundingClientRect(),heading=calendar.querySelector('.rf-weekdays').getBoundingClientRect().height,height=calendar.clientHeight-heading;
  if(height<1)return null;
  const window=el('div','rf-month-slide-window');window.setAttribute('aria-hidden','true');window.inert=true;
  Object.assign(window.style,{left:(rect.left-contentRect.left+calendar.clientLeft)+'px',top:(rect.top-contentRect.top+calendar.clientTop+heading)+'px',width:calendar.clientWidth+'px',height:height+'px'});
  const track=el('div','rf-month-slide-track');window.append(track);
  const motion={window,track,direction,next,height,offset:0,phase:'preview',animations:[],timer:null};monthMotion=motion;
  function page(sheet,scroll){
   const page=el('div','rf-month-slide-page');sheet.classList.add('rf-month-slide-sheet');sheet.removeAttribute('id');sheet.removeAttribute('aria-label');sheet.inert=true;
   sheet.querySelectorAll('[id]').forEach(node=>node.removeAttribute('id'));
   sheet.querySelectorAll('[aria-controls]').forEach(node=>node.removeAttribute('aria-controls'));
   Object.assign(sheet.style,{top:-heading+'px',height:calendar.clientHeight+'px'});page.append(sheet);track.append(page);sheet.scrollTop=scroll;return {page,sheet};
  }
  content.append(window);const outgoing=page(calendar.cloneNode(true),calendar.scrollTop),incomingSheet=el('main','rf-calendar');fillMonth(incomingSheet,next);
  for(const bar of incomingSheet.querySelectorAll('.rf-bar'))bar.classList.toggle('is-selected',bar.dataset.requirementId===state.selected);
  const incoming=page(incomingSheet,0);incoming.sheet.scrollTop=direction<0?incoming.sheet.scrollHeight-incoming.sheet.clientHeight:0;
  Object.assign(motion,{outgoing:outgoing.page,incoming:incoming.page,incomingSheet:incoming.sheet});root.classList.add('is-month-moving');positionMonthMotion(motion,0);return motion;
 }
 function positionMonthMotion(motion,offset){
  motion.offset=offset;motion.track.style.transform='translateY('+(-motion.direction*offset)+'px)';motion.incoming.style.transform='translateY('+(motion.direction*motion.height)+'px)';
 }
 function settleMonthMotion(commit){
  const motion=monthMotion;if(!motion)return;clearTimeout(motion.timer);motion.phase=commit?'settling':'returning';
  const destination=commit?motion.height:0,options={duration:commit?420:180,easing:commit?'cubic-bezier(.25,.1,.25,1)':'cubic-bezier(.2,.7,.2,1)',fill:'forwards'};
  try{
   motion.animations=[motion.track.animate([{transform:'translateY('+(-motion.direction*motion.offset)+'px)'},{transform:'translateY('+(-motion.direction*destination)+'px)'}],options)];
   Promise.all(motion.animations.map(animation=>animation.finished)).then(()=>{if(monthMotion===motion)cancelMonthMotion();},()=>{if(monthMotion===motion)cancelMonthMotion();});
  }catch{cancelMonthMotion();}
 }
 function previewMonthMotion(direction,next,distance){
  if(!monthMotion||monthMotion.direction!==direction||monthMotion.next!==next)beginMonthMotion(direction,next);
  const motion=monthMotion;if(!motion)return;clearTimeout(motion.timer);positionMonthMotion(motion,Math.min(distance*1.2,motion.height*.25));
  motion.timer=setTimeout(()=>{if(monthMotion===motion&&motion.phase==='preview')settleMonthMotion(false);},160);
 }

 const summaryFilter={scope:'month',query:'',tone:'all',state:'all',sort:'start'};let summaryComposing=null;
 function resetSummaryFilters(){summaryFilter.query='';summaryFilter.tone='all';summaryFilter.state='all';renderSummary();get('rf-summary').querySelector('[data-summary-control=query]').focus({preventScroll:true});}
 function setView(view){cancelMonthMotion();if(view!=='summary'&&summaryComposing){summaryFilter.query=summaryComposing.value;summaryComposing=null;}state.view=view;const summary=view==='summary';get('rf-calendar').hidden=summary;get('rf-summary').hidden=!summary;root.classList.toggle('has-summary',summary);get('rf-view').setAttribute('aria-pressed',String(summary));get('rf-view').setAttribute('aria-label',summary?'返回月历':'打开需求汇总');get('rf-view').title=summary?'返回月历':'需求汇总';if(summary)renderSummary();}
 function renderSummary(){
  if(summaryComposing?.isConnected)return;
  const host=get('rf-summary'),scroll=host.scrollTop,active=document.activeElement,focused=active?.dataset.summaryControl,selection=focused==='query'?[active.selectionStart,active.selectionEnd,active.selectionDirection]:null;
  const projection=CalendarPlanning.project(requirements,{anchor:state.anchor,today,...summaryFilter});host.replaceChildren();
  const header=el('div','rf-summary-header'),intro=el('div');intro.append(el('h2','','需求汇总'),el('p','rf-muted',summaryFilter.scope==='month'?'本月有交集的需求 · '+projection.scopeCount+' 项':'全部排期 · '+projection.scopeCount+' 项'));const exportButton=button('rf-button',exporting?'正在导出…':'导出 JSON','导出所列需求的完整排期，含全部时间节点',()=>requestJSON('summary'));exportButton.dataset.exportJson='';exportButton.dataset.summaryControl='export';exportButton.disabled=exporting;const actions=el('div','rf-summary-actions');actions.append(button('rf-button','导入 JSON','导入需求 JSON',()=>requestImportJSON()),exportButton);header.append(intro,actions);host.append(header);
  const controls=el('div','rf-summary-controls'),query=input('search',summaryFilter.query,'搜索需求及相关内容');query.setAttribute('aria-label','搜索需求');query.dataset.summaryControl='query';query.addEventListener('compositionstart',()=>{summaryComposing=query;});query.addEventListener('compositionend',()=>{if(summaryComposing===query)summaryComposing=null;summaryFilter.query=query.value;renderSummary();});query.addEventListener('input',event=>{if(event.isComposing||summaryComposing===query||!query.isConnected)return;summaryFilter.query=query.value;renderSummary();});query.addEventListener('keydown',event=>{if(event.key==='Escape'&&!event.isComposing&&summaryComposing!==query&&query.value){event.preventDefault();event.stopPropagation();summaryFilter.query='';renderSummary();}});controls.append(query);
  function selectControl(key,label,options){const control=el('select');control.setAttribute('aria-label',label);control.dataset.summaryControl=key;for(const [value,title] of options){const option=el('option','',title);option.value=value;option.selected=summaryFilter[key]===value;control.append(option);}control.addEventListener('change',()=>{summaryFilter[key]=control.value;renderSummary();});controls.append(control);}
  selectControl('scope','汇总范围',[['month','本月需求'],['all','全部需求']]);selectControl('tone','筛选配色',[['all','全部配色'],...Model.TONES.map(tone=>[tone.id,tone.name])]);selectControl('sort','排序方式',[['start','按开始日期'],['end','按结束日期'],['next','按下一节点'],['progress','按事项进度']]);if(summaryFilter.query||summaryFilter.tone!=='all'||summaryFilter.state!=='all'){const reset=button('rf-text-button','清除筛选','清除搜索、配色和状态筛选',resetSummaryFilters);controls.append(reset);}host.append(controls);
  const stats=el('div','rf-summary-stats');for(const [key,label] of [['all','全部'],...Object.entries(CalendarPlanning.STATUS)]){const card=button('rf-summary-stat'+(summaryFilter.state===key?' is-active':''),'',label+' '+projection.counts[key]+' 项',()=>{summaryFilter.state=key;renderSummary();});card.dataset.summaryControl='status-'+key;card.setAttribute('aria-pressed',String(summaryFilter.state===key));card.append(el('strong','',String(projection.counts[key])),el('span','',label));stats.append(card);}host.append(stats);
  const layout=el('div','rf-summary-layout'),list=el('section','rf-summary-list'),heading=el('div','rf-heading');heading.append(el('h3','','需求清单'),el('span','rf-muted',projection.rows.length+' 项'));list.append(heading);
  for(const row of projection.rows){
   const {item}=row,entry=button('rf-summary-row','',item.title+'，'+CalendarPlanning.STATUS[row.status]+'，'+item.start+' 至 '+item.end,event=>detail(item.id,event.currentTarget));
   entry.dataset.requirementId=item.id;applyTone(entry,item.tone);
   const info=el('span','rf-summary-info');info.append(el('strong','',item.title),el('span','rf-muted',rangeText(item.start,item.end,' — ')+' · '+(row.status==='completed'?CalendarPlanning.STATUS[row.status]:row.phase||CalendarPlanning.STATUS[row.status])));
   if(summaryFilter.sort==='next')info.append(el('span','rf-muted rf-summary-next',row.next?'下一节点：'+row.next.name+' · '+nodeDateText(row.next.date):'暂无待办节点'));
   const tail=el('span','rf-summary-progress');
   if(row.progress.total){const progress=el('progress');progress.max=row.progress.total;progress.value=row.progress.done;progress.setAttribute('aria-label','工作事项进度');tail.append(progress,el('span','rf-muted','事项 '+row.progress.done+' / '+row.progress.total));}
   else if(!row.nodes.total)tail.append(el('span','rf-muted','尚无事项'));
   if(row.nodes.total)tail.append(el('span','rf-muted rf-summary-node-progress','节点 '+row.nodes.done+' / '+row.nodes.total));entry.append(info,tail);list.append(entry);
  }
  if(!projection.rows.length){
   const empty=el('div','rf-summary-empty'),narrowed=summaryFilter.query||summaryFilter.tone!=='all'||summaryFilter.state!=='all';
   empty.append(el('p','',narrowed?'没有匹配的需求。可以清除筛选后继续查看。':requirements.length?'本月还没有排期，可以查看全部需求。':'还没有需求。点击或拖动日历日期开始排期。'));
   const action=narrowed?button('rf-button','清除条件',null,resetSummaryFilters):requirements.length?button('rf-button','查看全部需求',null,()=>{summaryFilter.scope='all';renderSummary();get('rf-summary').querySelector('[data-summary-control=scope]').focus({preventScroll:true});}):button('rf-button','返回日历',null,()=>command('summary'));empty.append(action);list.append(empty);
  }
  layout.append(list);host.append(layout);selectRequirement(state.selected);host.scrollTop=scroll;
  if(focused){const next=host.querySelector('[data-summary-control="'+focused+'"]');next?.focus({preventScroll:true});if(selection&&next)next.setSelectionRange(...selection);}
 }
 function revealCalendarRequirement(id){
  const calendar=get('rf-calendar'),bar=Array.from(calendar.querySelectorAll('.rf-bar')).find(node=>node.dataset.requirementId===id);if(!bar)return;
  const bounds=bar.getBoundingClientRect(),viewport=calendar.getBoundingClientRect(),top=calendar.querySelector('.rf-weekdays').getBoundingClientRect().bottom+(calendar.querySelector('.rf-date-label')?.offsetHeight||0)+8,bottom=viewport.top+calendar.clientTop+calendar.clientHeight-8;
  if(bounds.top<top)calendar.scrollTop-=top-bounds.top;else if(bounds.bottom>bottom)calendar.scrollTop+=bounds.bottom-bottom;
 }
 function nodeDateText(date){return (date.slice(0,4)!==state.anchor.slice(0,4)?Number(date.slice(0,4))+'.':'')+format(date);}
 function rangeText(start,end,separator='—'){const years=start.slice(0,4)!==end.slice(0,4)||start.slice(0,4)!==state.anchor.slice(0,4);const date=value=>(years?Number(value.slice(0,4))+'.':'')+format(value);return date(start)+separator+date(end);}
 function resourceIcon(value,url=''){const icon=el('span','rf-resource-icon');icon.setAttribute('aria-hidden','true');void siteIcons.apply(icon,url,value||'文');return icon;}
 function resourceRow(r){const row=el(r.url?'a':'div','rf-resource-row');if(r.url){row.href=r.url;row.title=r.url;row.target='_blank';row.rel='noopener noreferrer';}row.append(resourceIcon(r.icon,r.url));if(r.url)row.classList.add('is-link');const text=el('span','rf-resource-text');text.append(el('strong','',r.name),el('small','',r.type||'资料'));row.append(text);return row;}
 function captureDetailPosition(id,action){
  const panel=get('rf-panel');if(state.selected!==id||get('rf-detail').hidden||!panel.querySelector('.rf-detail-title'))return null;
  const top=panel.getBoundingClientRect().top,sections=Array.from(panel.querySelectorAll('.rf-section')),index=panel.scrollTop>0?sections.findIndex(section=>section.getBoundingClientRect().bottom>top):-1;
  return {scroll:panel.scrollTop,section:index,offset:index>=0?top-sections[index].getBoundingClientRect().top:0,action,nodeId:document.activeElement?.closest('.rf-node-detail')?.dataset.nodeId};
 }
 function restoreDetailPosition(context){
  const panel=get('rf-panel'),sections=Array.from(panel.querySelectorAll('.rf-section')),section=sections[context.section];
  panel.scrollTop=section?panel.scrollTop+section.getBoundingClientRect().top-panel.getBoundingClientRect().top+context.offset:context.scroll;
  const target=context.nodeId?Array.from(panel.querySelectorAll('.rf-node-detail')).find(row=>row.dataset.nodeId===context.nodeId)?.querySelector('input'):context.action==='milestones'?panel.querySelector('[data-edit-nodes]'):context.action==='resources'?sections[1]?.querySelector('button'):context.action==='phases'?sections[0]?.querySelector('button'):panel.querySelector('.rf-detail-actions .rf-button');
  const bounds=target?.getBoundingClientRect(),viewport=panel.getBoundingClientRect();
  (bounds&&bounds.top>=viewport.top-1&&bounds.bottom<=viewport.bottom+1?target:get('rf-close')).focus({preventScroll:true});
 }
 async function commitDetailChange(item,control,change,refresh,label){
  if(saving){refresh();return false;}
  const panel=get('rf-panel'),calendar=get('rf-calendar'),position={panel:panel.scrollTop,calendar:calendar.scrollTop},focused=document.activeElement===control;
  const next=requirements.map(current=>current.id===item.id?change(current):current);let ok=false;
  setSaving(true);
  try{ok=await save(next);if(ok){requirements=next;Object.assign(item,req(item.id));render();calendar.scrollTop=position.calendar;}}
  catch(error){showStorageIssue(error.message||'保存失败，请重试。');}
  finally{setSaving(false);}
  if(control.isConnected){refresh();if(focused)control.focus({preventScroll:true});panel.scrollTop=position.panel;}
  if(ok)get('rf-feedback').textContent=label;return ok;
 }
 function detail(id,trigger,force=false,returnContext=null,targetNodeId=returnContext?.nodeId??trigger?.dataset.nodeId){
  if(saving)return;if(!force&&!mayLeave(()=>detail(id,trigger,true,returnContext,targetNodeId)))return;const r=req(id);if(!r)return;
  clearDraftPreview();selectRequirement(id);openPanel('需求详情',trigger,r.tone);const panel=get('rf-panel');
  panel.append(el('h2','rf-detail-title',r.title));const meta=el('div','rf-meta');meta.append(el('span','rf-pill rf-period',rangeText(r.start,r.end,' — ')));
  if(r.reminder)meta.append(el('span','rf-pill','提醒 '+r.reminder.replace('T',' ')));
  const stateLabel=el('span','rf-pill rf-state');
  function refreshState(){const status=CalendarPlanning.status(r,today);stateLabel.textContent=status==='completed'?CalendarPlanning.STATUS[status]:CalendarPlanning.currentPhase(r,today)||CalendarPlanning.STATUS[status];stateLabel.classList.toggle('is-inactive',status==='upcoming'||status==='past');}
  refreshState();meta.append(stateLabel);panel.append(meta);
  const columns=el('div','rf-detail-columns'),phases=el('section','rf-section'),ph=el('div','rf-heading');
  ph.append(el('h3','','阶段安排'),button('rf-text-button','编辑',null,()=>edit(r.id,undefined,undefined,'phases')));phases.append(ph);
  for(const p of r.phases){const row=el('div','rf-phase-row'+(p.start<=today&&p.end>=today?' current':''));row.append(el('span','rf-phase-name',p.name),el('span','rf-muted rf-phase-period',rangeText(p.start,p.end)));phases.append(row);}
  if(!r.phases.length)phases.append(el('p','rf-note','尚未安排阶段'));columns.append(phases);
  const resources=el('section','rf-section'),rh=el('div','rf-heading');rh.append(el('h3','','相关资料'),button('rf-text-button','管理',null,()=>editResources(r.id)));resources.append(rh);
  r.resources.forEach(x=>resources.append(resourceRow(x)));if(!r.resources.length)resources.append(el('p','rf-note','可以添加任意名称和类型的资料'));columns.append(resources);
  if(r.milestones.length){
   const nodes=el('section','rf-section rf-detail-nodes'),heading=el('div','rf-heading'),count=el('span','rf-muted');
   const progress=()=>count.textContent=r.milestones.filter(node=>node.done).length+' / '+r.milestones.length;
   const nodeActions=el('div','rf-node-actions'),editNodes=button('rf-text-button','编辑','编辑时间节点',()=>edit(r.id,undefined,undefined,'milestones'));editNodes.dataset.editNodes='';nodeActions.append(count,editNodes);
   progress();heading.append(el('h3','','时间节点'),nodeActions);nodes.append(heading);
   for(const node of r.milestones){
    const row=el('label','rf-node-detail'),check=input('checkbox'),symbol=el('span','rf-node-glyph',nodeKind(node).symbol),info=el('div'),description=el('span','rf-muted');
    row.dataset.nodeId=node.id;row.classList.toggle('is-targeted',node.id===targetNodeId);check.setAttribute('aria-label',node.name+'，'+nodeKind(node).name+'，'+node.date+'，已完成');symbol.setAttribute('aria-hidden','true');
    info.append(el('strong','',node.name),description);row.append(check,symbol,info);
    const refresh=()=>{const saved=r.milestones.find(value=>value.id===node.id);check.checked=saved.done;row.classList.toggle('is-done',saved.done);row.classList.toggle('is-overdue',CalendarPlanning.nodeStatus(saved,today)==='overdue');description.textContent=nodeKind(saved).name+' · '+saved.date+(saved.done?' · 已完成':saved.date<today?' · 已过计划日期':'');progress();refreshState();};refresh();
    check.addEventListener('change',()=>{const checked=check.checked;void commitDetailChange(r,check,current=>({...current,milestones:current.milestones.map(value=>value.id===node.id?{...value,done:checked}:value)}),refresh,node.name+(checked?'已完成':'已恢复待办'));});nodes.append(row);
   }
   columns.append(nodes);
  }
  const tasks=el('section','rf-section'),th=el('div','rf-heading'),count=el('span','rf-muted'),progress=()=>count.textContent=r.done.filter(Boolean).length+' / '+r.tasks.length;
  progress();th.append(el('h3','','工作事项'),count);tasks.append(th);
  r.tasks.forEach((text,i)=>{const label=el('label','rf-task'),check=input('checkbox');check.checked=!!r.done[i];check.addEventListener('change',()=>{const checked=check.checked;void commitDetailChange(r,check,current=>({...current,done:current.done.map((value,index)=>index===i?checked:value)}),()=>{check.checked=r.done[i];progress();refreshState();},text+(checked?'已完成':'已恢复待办'));});label.append(check,el('span','',text));tasks.append(label);});
  if(!r.tasks.length)tasks.append(el('p','rf-note','暂无工作事项'));columns.append(tasks);
  const note=el('section','rf-section');note.append(el('h3','rf-heading','事项与备忘'),el('p','rf-note',r.note||'暂无备忘'));columns.append(note);panel.append(columns);
  const actions=el('div','rf-detail-actions');const editActions=el('div','rf-detail-edit-actions');editActions.append(button('rf-button rf-primary','编辑需求',null,()=>edit(r.id)),button('rf-text-button','复制为新需求',null,()=>duplicateRequirement(r.id)));actions.append(editActions,button('rf-text-button rf-destructive','删除需求',null,()=>deleteRequirement(r.id)));panel.append(actions);
  if(returnContext)restoreDetailPosition(returnContext);else if(targetNodeId){const target=Array.from(panel.querySelectorAll('.rf-node-detail')).find(row=>row.dataset.nodeId===targetNodeId)?.querySelector('input');if(target)focusEditorControl(target);else get('rf-close').focus({preventScroll:true});}else get('rf-close').focus({preventScroll:true});
 }
 const iconFor=Model.iconFor;
 function symbolForResource(row){
  const url=row.url.value.trim(),type=row.type.value.trim(),original=row.originalIcon;
  if(url)return iconFor(url,type);
  if(original&&(!CalendarIcons.hasSymbol(original)||(type===row.originalType&&!row.originalURL)))return original;
  return iconFor('',type);
 }
 function durationText(start,end){return validDate(start)&&validDate(end)&&end>=start?'共 '+(days(start,end)+1)+' 天':'';}
 function constrainPlanDates(node,range){const valid=validDate(range?.start)&&validDate(range?.end)&&range.end>=range.start;for(const control of node.querySelectorAll('input[type=date]')){control.min=valid?range.start:'0001-01-01';control.max=valid?range.end:'9999-12-31';}}
 function resourceSource(url){try{return new URL(Model.safeURL(url)).hostname;}catch{return '';}}
 function editorHeading(title,label,action){const head=el('div','rf-heading'),group=el('div','rf-editor-title'),count=el('span','rf-muted rf-editor-count');count.hidden=true;group.append(el('h3','',title),count);head.append(group,button('rf-text-button',label,null,action));return {node:head,update(value){count.hidden=!value;count.textContent=String(value);count.setAttribute('aria-label',title+'共 '+value+' 项');}};}
 function collection(kind,initial,rangeProvider){
  const section=el('section','rf-editor-section'),list=el('div'),rows=[],heading=editorHeading(kind==='phase'?'阶段安排':'相关资料',kind==='phase'?'添加阶段':'添加资料',()=>addItem({},true)),head=heading.node;
  section.append(head,list);
  function addItem(value={},expand=false){
   if(kind==='phase'&&expand&&!value.start&&!value.end){const date=CalendarPlanning.firstFreePhaseDate(rangeProvider(),rows.map(row=>({start:row.start.value,end:row.end.value})));value={...value,start:date,end:date};}
   const item=el('div','rf-editor-item'),disclosure=el('details','rf-disclosure'),summary=el('summary','rf-item-summary cursor-interaction'+(kind==='phase'?' rf-phase-summary':' rf-resource-summary')),summaryName=el('span','rf-summary-name'),summaryMeta=el('span','rf-summary-meta'),body=el('div','rf-disclosure-body'),fields=el('div','rf-item-fields'),name=input('text',value.name||'',kind==='phase'?'例如：评审、开发、联调':'资料名称');
   name.maxLength=64;name.required=true;const row={item,disclosure,name};const summaryIcon=kind==='resource'?resourceIcon(value.icon||Model.iconFor(value.url||'',value.type||''),value.url||''):null;if(summaryIcon)summary.append(summaryIcon);summary.append(summaryName,summaryMeta);fields.append(field('名称',name));
   if(kind==='phase'){
    row.start=input('date',value.start||'');row.end=input('date',value.end||'');row.start.required=true;row.end.required=true;
    const pair=el('div','rf-pair');pair.append(field('开始日期',row.start),field('结束日期',row.end));fields.append(pair);
   }else{
    row.type=input('text',value.type||'','文档、设计、接口或自定义');row.type.maxLength=32;row.url=input('url',value.url||'','https://…');row.originalIcon=value.icon;row.originalType=(value.type||'').trim();row.originalURL=value.url||'';
    fields.append(field('类型（可自定义）',row.type),field('链接（可选）',row.url));
   }
   const updateSummary=()=>{if(summaryIcon){const icon=symbolForResource(row);void siteIcons.apply(summaryIcon,row.url.value,icon,{fetch:false});}summaryName.title=name.value;summaryName.textContent=name.value.trim()||(kind==='phase'?'未命名阶段':'未命名资料');summaryMeta.textContent=kind==='phase'?(row.start.value&&row.end.value?rangeText(row.start.value,row.end.value)+(durationText(row.start.value,row.end.value)?' · '+durationText(row.start.value,row.end.value):''):'设置日期'):[row.type.value.trim()||'自定义资料',resourceSource(row.url.value)].filter(Boolean).join(' · ');summaryMeta.title=summaryMeta.textContent;};
   updateSummary();fields.addEventListener('input',updateSummary);if(summaryIcon)fields.addEventListener('change',()=>{const icon=symbolForResource(row);void siteIcons.apply(summaryIcon,row.url.value,icon);});fields.addEventListener('invalid',()=>{CalendarDisclosure.setOpen(disclosure,true);},true);
   body.append(fields);disclosure.append(summary,body);CalendarDisclosure.create(disclosure,body,{onOpen:()=>rows.forEach(other=>{if(other!==row)CalendarDisclosure.setOpen(other.disclosure,false,{animate:true});})});
   item.append(disclosure,removeButton(kind==='phase'?'阶段':'资料',name,()=>{const index=rows.indexOf(row);CalendarDisclosure.dispose(disclosure);item.remove();rows.splice(index,1);heading.update(rows.length);(rows[index]?.disclosure.querySelector('summary')||rows[index-1]?.disclosure.querySelector('summary')||head.querySelector('button')).focus();}));rows.push(row);list.append(item);heading.update(rows.length);if(kind==='phase')constrainPlanDates(item,rangeProvider());
   if(expand){rows.forEach(other=>CalendarDisclosure.setOpen(other.disclosure,other===row));focusEditorControl(name);}
  }
  initial.forEach(value=>addItem(value));
  return {node:section,updateRange(){if(kind==='phase')constrainPlanDates(list,rangeProvider());},reveal(){const target=rows[0]?.disclosure.querySelector('summary')||head.querySelector('button');focusEditorControl(target);},focus(index,key='name'){const row=rows[index];if(row){CalendarDisclosure.setOpen(row.disclosure,true);const control=row[key]||row.name;focusEditorControl(control);control.setAttribute('aria-invalid','true');const error=control.closest('form')?.querySelector('.rf-error');if(error)control.setAttribute('aria-describedby',error.id);}},setDates(values){rows.forEach((row,index)=>{for(const key of ['start','end']){row[key].value=values[index][key];row[key].dispatchEvent(new Event('input',{bubbles:true}));}});},read:()=>rows.map(row=>kind==='phase'?{name:row.name.value.trim(),start:row.start.value,end:row.end.value}:{name:row.name.value.trim(),type:row.type.value.trim(),url:row.url.value.trim(),icon:symbolForResource(row)})};
 }
 function resourceError(items){if(items.some(x=>!x.name))return '请填写资料名称。';try{items.forEach(x=>Model.safeURL(x.url));}catch(error){return error.message;}return '';}
 function validateForm(form){const invalid=Array.from(form.elements).find(control=>control.willValidate&&!control.validity.valid);if(!invalid)return true;const disclosure=invalid.closest('details');if(disclosure)CalendarDisclosure.setOpen(disclosure,true);invalid.setAttribute('aria-invalid','true');invalid.reportValidity();focusEditorControl(invalid);return false;}
 function editResources(id){edit(id,undefined,undefined,'resources');}
 function reminderField(control){
  const node=el('details','rf-reminder-editor'),summary=el('summary','rf-reminder-summary cursor-interaction'),value=el('span','rf-reminder-value'),body=el('div','rf-disclosure-body'),fields=el('div','rf-reminder-fields');
  summary.append(el('span','','提醒'),value);
  const update=()=>{value.textContent=control.value?control.value.replaceAll('-','.').replace('T',' '):control.validity.badInput?'待完善':'未设置';value.title=control.value?'本机时间 '+control.value.replace('T',' '):value.textContent;};
  const clear=button('rf-text-button','不提醒','清除提醒',()=>{control.value='';control.dispatchEvent(new Event('input',{bubbles:true}));CalendarDisclosure.setOpen(node,false,{animate:true});summary.focus({preventScroll:true});});
  fields.append(field('本机日期与时间',control),clear);body.append(fields);node.append(summary,body);CalendarDisclosure.create(node,body);control.addEventListener('input',update);control.addEventListener('change',update);update();
  return {node,reveal(){CalendarDisclosure.setOpen(node,true);focusEditorControl(control);}};
 }
 function nextRequirementTone(){
  const tones=Model.TONES.map(tone=>tone.id),counts=new Map(tones.map(tone=>[tone,0])),grid=Model.monthGrid(state.anchor),end=boundedAdd(grid.start,grid.count*7-1)||'9999-12-31';
  for(const item of requirements)if(item.start<=end&&item.end>=grid.start)counts.set(item.tone,counts.get(item.tone)+1);
  return tones.reduce((best,tone)=>counts.get(tone)<counts.get(best)?tone:best);
 }
 function duplicateRequirement(id){if(saving)return;const source=req(id);if(!source)return;let draft;try{draft=Model.duplicateRequirement(source,today);}catch(error){showStorageIssue('无法复制到当前日期：'+error.message);return;}edit(null,draft.start,draft.end,'basic',false,draft.tone,0,draft);}
 function edit(id=null,date=state.anchor,endDate=date,initialTab='basic',force=false,draftTone=null,shiftDays=0,draftSeed=null){
  if(saving)return;
  if(!force&&!mayLeave(()=>edit(id,date,endDate,initialTab,true,draftTone,shiftDays,draftSeed)))return;
  const existing=req(id),draft=existing?structuredClone(existing):draftSeed?structuredClone(draftSeed):{id:Model.newId(),title:'',short:'',tone:draftTone??nextRequirementTone(),start:date,end:endDate,phases:[],milestones:[],resources:[],tasks:[],done:[],note:''};
  const shifted=existing&&shiftDays?Model.shiftRequirement(existing,shiftDays):null;
  const returnContext=existing?captureDetailPosition(id,initialTab):null;
  if(state.view==='summary'||draftSeed){state.anchor=draft.start;setView('month');render();get('rf-calendar').scrollTop=0;}selectRequirement(existing?id:null);openPanel(existing?'编辑需求':'新建需求',undefined,draft.tone);
  const form=el('form','rf-form');form.noValidate=true;
  const basic=el('section','rf-editor-basics'),prefix='rf-editor-'+Date.now();basic.dataset.editorPanel='basic';basic.setAttribute('aria-label','名称与排期');
  function revealSection(key){const target=key==='phases'?phases.node:key==='resources'?resources.node:key==='milestones'?milestones.node:basic;target.scrollIntoView({block:'nearest'});}
  const name=input('text',draft.title,'例如：支付结果页改版');name.required=true;name.maxLength=64;
  const start=input('date',draft.start),end=input('date',draft.end);start.required=true;end.required=true;
  const syncDraftPreview=()=>{updateDraftPreview(start.value,end.value,draft.tone);duration.textContent=durationText(start.value,end.value);duration.hidden=!duration.textContent;};for(const control of [start,end]){control.addEventListener('input',syncDraftPreview);control.addEventListener('change',syncDraftPreview);}
  const duration=el('span','rf-muted rf-duration'),period=el('div','rf-editor-period'),pair=el('div','rf-pair');duration.setAttribute('aria-live','polite');pair.append(field('开始日期',start),field('结束日期',end));period.append(pair,duration);
  const note=el('textarea');note.value=draft.note;note.placeholder='评审结论、阻塞事项、接口约定…';
  let noteAutoHeight=null,noteWidth=0;
  function fitNote(){
   if(!note.clientWidth)return;
   if(noteAutoHeight!==null&&note.style.height!==noteAutoHeight){note.style.flex='none';noteField.style.flex='0 0 auto';return;}
   const scroll=note.scrollTop;note.style.height='auto';const style=getComputedStyle(note);
   note.style.height=Math.min(240,note.scrollHeight+parseFloat(style.borderTopWidth)+parseFloat(style.borderBottomWidth))+'px';
   noteAutoHeight=note.style.height;note.scrollTop=scroll;
   if(document.activeElement===note)revealEditorControl(note);
  }
  function resizeNote(){const width=note.clientWidth;if(width&&width!==noteWidth){noteWidth=width;fitNote();}}
  note.addEventListener('input',fitNote);
  const titleField=field('需求名称',name);titleField.classList.add('rf-title-field');basic.append(titleField,period);
  const colors=el('fieldset','rf-colors');colors.append(el('legend','','需求配色'));for(const tone of Model.TONES){const label=el('label','rf-color-option');label.title=tone.name;label.style.setProperty('--rf-swatch',tone.color);const radio=input('radio',tone.id);radio.name=prefix+'-tone';radio.checked=draft.tone===tone.id;radio.setAttribute('aria-label',tone.name);radio.addEventListener('change',()=>{draft.tone=radio.value;get('rf-detail').dataset.tone=draft.tone;applyTone(get('rf-detail'),draft.tone,'detail');syncDraftPreview();});label.append(radio,el('span','rf-color-dot'));colors.append(label);}basic.append(colors);
  const reminder=input('datetime-local',draft.reminder||''),reminderUI=nativeBridge?reminderField(reminder):null;if(reminderUI)basic.append(reminderUI.node);
  const liveRange=()=>({start:start.value,end:end.value}),phases=collection('phase',draft.phases,liveRange),resources=collection('resource',draft.resources);phases.node.dataset.editorPanel='phases';resources.node.dataset.editorPanel='resources';const milestones=milestoneEditor(draft,liveRange);const noteField=field('事项与备忘',note);noteField.classList.add('rf-editor-note');
  const updatePlanBounds=()=>{phases.updateRange();milestones.updateRange();};for(const control of [start,end]){control.addEventListener('input',updatePlanBounds);control.addEventListener('change',updatePlanBounds);}updatePlanBounds();
  const error=el('p','rf-error');error.id=prefix+'-error';error.setAttribute('role','alert');form.addEventListener('input',()=>{cancelBarSelection();error.textContent='';form.querySelectorAll('[aria-invalid]').forEach(control=>control.removeAttribute('aria-invalid'));});
  const actions=el('div','rf-form-actions'),submit=el('button','rf-button rf-primary cursor-interaction','保存需求');submit.type='submit';actions.append(button('rf-button','取消',null,()=>cancelEdit()),submit);
  form.append(basic,phases.node,milestones.node,resources.node,taskEditor(draft),noteField,error,actions);form.querySelectorAll('input,textarea,select').forEach(control=>control.setAttribute('aria-describedby',error.id));
  form.addEventListener('invalid',event=>{const panel=event.target.closest('[data-editor-panel]');if(panel)revealSection(panel.dataset.editorPanel);const disclosure=event.target.closest('details');if(disclosure)CalendarDisclosure.setOpen(disclosure,true);},true);
  async function submitDraft(){
   if(saving)return false;if(!validateForm(form))return false;
   if(!name.value.trim()){revealSection('basic');error.textContent='请填写需求名称。';name.focus();name.setAttribute('aria-invalid','true');return false;}
   if(nativeBridge&&reminder.value&&reminder.value!==(existing?.reminder??'')&&new Date(reminder.value).getTime()<=Date.now()){revealSection('basic');error.textContent='提醒时间需要晚于当前时间。';reminder.setAttribute('aria-invalid','true');reminderUI.reveal();return false;}
   if(end.value<start.value){revealSection('basic');error.textContent='结束日期不能早于开始日期。';end.focus();end.setAttribute('aria-invalid','true');return false;}
   const unsortedPhases=phases.read(),phaseItems=[...unsortedPhases].sort((a,b)=>a.start.localeCompare(b.start)),resourceItems=resources.read();
   const badPhase=phaseItems.find(p=>!p.name||p.start<start.value||p.end>end.value||p.end<p.start);if(badPhase){revealSection('phases');error.textContent='阶段需要填写名称，且日期须落在需求周期内。';phases.focus(unsortedPhases.indexOf(badPhase),'start');return false;}
   const overlap=phaseItems.find((p,i)=>i>0&&p.start<=phaseItems[i-1].end);if(overlap){revealSection('phases');error.textContent='阶段日期存在重叠，请调整后保存。';phases.focus(unsortedPhases.indexOf(overlap),'start');return false;}
   const nodeItems=milestones.read(),badNode=nodeItems.findIndex(node=>!node.name.trim()||!validDate(node.date)||node.date<start.value||node.date>end.value);if(badNode>=0){revealSection('milestones');error.textContent='请填写节点名称，日期须落在需求周期内。';milestones.focus(badNode);return false;}
   const message=resourceError(resourceItems);if(message){revealSection('resources');error.textContent=message;const index=resourceItems.findIndex(x=>{try{Model.safeURL(x.url);return false;}catch{return true;}});resources.focus(Math.max(0,index),'url');return false;}
   Object.assign(draft,{title:name.value.trim(),short:name.value.trim(),start:start.value,end:end.value,phases:phaseItems,milestones:nodeItems,resources:resourceItems,reminder:nativeBridge?(reminder.value||null):draft.reminder??null,tasks:Array.from(form.querySelectorAll('.rf-task-edit input[type=text]'),x=>x.value.trim()),done:Array.from(form.querySelectorAll('.rf-task-edit input[type=checkbox]'),x=>x.checked),note:note.value});
   try{Object.assign(draft,Model.requirement(draft));}catch(issue){error.textContent=issue.message;return false;}
   const next=existing?requirements.map(r=>r.id===id?draft:r):[...requirements,draft],previousAnchor=state.anchor;if(!existing)state.anchor=draft.start;
   setSaving(true);const ok=await save(next);setSaving(false);if(!ok){state.anchor=previousAnchor;error.textContent='保存失败，更改仍保留在编辑器中。请检查上方提示后重试。';return false;}requirements=next;
   editor=null;clearDraftPreview();render();detail(draft.id,undefined,true,returnContext);get('rf-feedback').textContent='已保存：'+draft.title+' · '+rangeText(draft.start,draft.end);if(pendingAction){const action=pendingAction;pendingAction=null;get('rf-discard').close();action();}return true;
  }
  form.addEventListener('submit',event=>{event.preventDefault();void submitDraft();});
  get('rf-panel').append(form);syncDraftPreview();const fingerprint=()=>JSON.stringify(Array.from(form.querySelectorAll('input,textarea,select'),control=>[control.type,control.value,control.checked,control.validity.badInput]));const original=fingerprint();editor={form,submit:submitDraft,resizeNote,isDirty:()=>!!draftSeed||fingerprint()!==original,cancel:()=>existing?detail(id,undefined,true,returnContext):closePanel(true)};resizeNote();if(initialTab==='resources')resources.reveal();else if(initialTab==='phases')phases.reveal();else if(initialTab==='milestones')milestones.reveal();else name.focus({preventScroll:true});
  // Capture the saved fingerprint before applying the moved dates. The moved
  // plan is a real unsaved draft, even before its first keystroke.
  if(shifted){start.value=shifted.start;end.value=shifted.end;phases.setDates(shifted.phases);milestones.setDates(shifted.milestones);syncDraftPreview();start.focus({preventScroll:true});}
 }
 function setSaving(value,{keepEditorInteractive=false}={}){if(value)cancelCalendarGesture();saving=value;root.setAttribute('aria-busy',String(value));get('rf-panel').inert=value&&!keepEditorInteractive;get('rf-month-form').inert=value;get('rf-import-form').inert=value;for(const id of ['rf-close','rf-undo','rf-title'])get(id).disabled=value;const submit=editor?.form.querySelector('[type=submit]');if(submit){submit.disabled=value;submit.textContent=value?'正在保存…':'保存需求';}if(!value&&queuedNotification){const id=queuedNotification;queuedNotification=null;queueMicrotask(()=>CalendarApp.openRequirement(id));}}
 function mayLeave(action){if(saving)return false;if(!editor?.isDirty())return true;pendingAction=action;const dialog=get('rf-discard');if(!dialog.open){const panel=get('rf-panel'),active=document.activeElement,bounds=active?.getBoundingClientRect(),viewport=panel.getBoundingClientRect();discardPosition={panel:panel.scrollTop,calendar:get('rf-calendar').scrollTop};
   // A scrolled-away input can retain focus. Returning focus to it when the
   // dialog closes makes WebKit scroll again after the restoration frame.
   // Use the visible panel control as the return target in that case.
   if(panel.contains(active)&&bounds&&(bounds.top<viewport.top||bounds.bottom>viewport.bottom))get('rf-close').focus({preventScroll:true});
   dialog.showModal();}return false;}
 function cancelEdit(){const action=editor?.cancel;if(action&&mayLeave(action))action();}
 function resumeDraft(){pendingAction=null;const position=discardPosition,form=editor?.form;discardPosition=null;get('rf-discard').close();const restore=()=>{if(position&&editor?.form===form){get('rf-panel').scrollTop=position.panel;get('rf-calendar').scrollTop=position.calendar;}};restore();if(discardRestoreFrame!==null)cancelAnimationFrame(discardRestoreFrame);discardRestoreFrame=requestAnimationFrame(()=>{discardRestoreFrame=null;restore();});}
 get('rf-discard-keep').addEventListener('click',resumeDraft);
 get('rf-discard').addEventListener('cancel',event=>{event.preventDefault();resumeDraft();});
 get('rf-discard-drop').addEventListener('click',()=>{const action=pendingAction;pendingAction=null;editor=null;get('rf-discard').close();action?.();});
 get('rf-discard-save').addEventListener('click',async()=>{get('rf-discard').close();const ok=await editor?.submit();if(!ok)pendingAction=null;});
 window.addEventListener('beforeunload',event=>{if(editor?.isDirty()){event.preventDefault();event.returnValue='';}});
 function milestoneEditor(draft,rangeProvider){
  const node=el('section','rf-editor-section rf-milestone-editor'),list=el('div'),rows=[],head=editorHeading('时间节点','添加节点',()=>append({id:Model.newId(),name:'',date:CalendarPlanning.defaultNodeDate(rangeProvider(),today),kind:'checkpoint',done:false},true)),heading=head.node;node.dataset.editorPanel='milestones';node.append(heading,list);
  function append(value,focus=false){
   const row=el('div','rf-milestone-edit'),check=input('checkbox'),name=input('text',value.name,'例如：方案评审、灰度发布'),date=input('date',value.date),kind=el('select');check.checked=value.done;check.setAttribute('aria-label','节点已完成');name.required=true;name.maxLength=64;name.setAttribute('aria-label','节点名称');date.required=true;date.setAttribute('aria-label','节点日期');kind.setAttribute('aria-label','节点类型');for(const item of Model.NODE_KINDS){const option=el('option','',item.symbol+' '+item.name);option.value=item.id;option.selected=item.id===value.kind;kind.append(option);}
   const info=el('div','rf-milestone-fields'),pair=el('div','rf-pair'),status=el('small','rf-node-plan-status');row.dataset.nodeId=value.id;pair.append(field('日期',date),field('类型',kind));info.append(name,pair,status);
   const updateStatus=()=>{const late=CalendarPlanning.nodeStatus({date:date.value,done:check.checked},today)==='overdue'&&validDate(date.value);row.classList.toggle('is-done',check.checked);status.hidden=!late;status.textContent=late?'已过计划日期，尚未完成':'';};date.addEventListener('input',updateStatus);date.addEventListener('change',updateStatus);check.addEventListener('change',updateStatus);updateStatus();row.append(check,info,removeButton('节点',name,()=>{const index=rows.findIndex(item=>item.row===row);row.remove();rows.splice(index,1);head.update(rows.length);const target=rows[index]?.name||rows[index-1]?.name||heading.querySelector('button');focusEditorControl(target);}));constrainPlanDates(row,rangeProvider());list.append(row);rows.push({row,id:value.id,name,date,kind,check});head.update(rows.length);if(focus)focusEditorControl(name);
  }
  for(const value of draft.milestones||[])append(value);
  return {node,updateRange(){constrainPlanDates(list,rangeProvider());},reveal(){focusEditorControl(rows[0]?.name||heading.querySelector('button'));},read:()=>rows.map(row=>({id:row.id,name:row.name.value.trim(),date:row.date.value,kind:row.kind.value,done:row.check.checked})),focus(index){focusEditorControl(rows[index].date);rows[index].date.setAttribute('aria-invalid','true');},setDates(values){for(const row of rows){row.date.value=values.find(value=>value.id===row.id).date;row.date.dispatchEvent(new Event('input',{bubbles:true}));}}};
 }
 function taskEditor(draft){const section=el('section','rf-editor-section'),list=el('div'),head=editorHeading('工作事项','添加事项',()=>append('',false,true)),heading=head.node;section.append(heading,list);
  function append(text,done,focus=false,after=null){const row=el('div','rf-task-edit'),check=input('checkbox'),name=input('text',text,'可验收的具体事项');check.checked=done;check.setAttribute('aria-label','事项已完成');name.setAttribute('aria-label','事项内容');name.required=true;name.maxLength=200;row.append(check,name,removeButton('事项',name,()=>{const next=row.nextElementSibling?.querySelector('input[type=text]')||row.previousElementSibling?.querySelector('input[type=text]');row.remove();head.update(list.childElementCount);(next||heading.querySelector('button')).focus();}));name.title='回车添加下一事项';name.addEventListener('keydown',event=>{if(event.key!=='Enter'||event.isComposing||event.keyCode===229||event.metaKey||event.ctrlKey||event.altKey||event.shiftKey)return;event.preventDefault();if(name.value.trim())append('',false,true,row);});list.insertBefore(row,after?.nextElementSibling||null);head.update(list.childElementCount);if(focus)focusEditorControl(name);}
  draft.tasks.forEach((text,i)=>append(text,draft.done[i]));return section;
 }
 async function deleteRequirement(id,force=false){if(saving)return false;if(!force&&editor?.isDirty()){mayLeave(()=>deleteRequirement(id,true));return false;}const item=req(id);if(!item)return;const next=requirements.filter(r=>r.id!==id);setSaving(true);const ok=await save(next);setSaving(false);if(!ok)return;requirements=next;deleted=structuredClone(item);closePanel(true);render();get('rf-toast-text').textContent='已删除“'+item.title+'”';get('rf-toast').hidden=false;}
 async function undoDeletion(force=false){if(saving||!deleted||req(deleted.id))return false;if(!force&&editor?.isDirty()){mayLeave(()=>undoDeletion(true));return false;}const next=[...requirements,deleted],previous=state.anchor;state.anchor=deleted.start;setSaving(true);const ok=await save(next);setSaving(false);if(!ok){state.anchor=previous;return;}const id=deleted.id;requirements=next;deleted=null;get('rf-toast').hidden=true;render();detail(id);return true;}
 get('rf-undo').addEventListener('click',()=>undoDeletion());
 async function navigateToMonth(next,direction=0){
  if(saving||!validDate(next))return false;if(next.slice(0,7)===state.anchor.slice(0,7))return true;
  const calendar=get('rf-calendar'),summary=get('rf-summary'),previous=state.anchor,scroll=calendar.scrollTop,summaryScroll=summary.scrollTop,previousFocus={...calendarFocus};
  if(monthMotion&&monthMotion.next!==next)cancelMonthMotion();if(direction&&!monthMotion)beginMonthMotion(direction,next);const motion=direction?monthMotion:null;
  state.anchor=next;render(!!motion);calendar.scrollTop=direction<0?calendar.scrollHeight-calendar.clientHeight:0;summary.scrollTop=0;
  if(motion){const replacement=calendar.cloneNode(true);replacement.removeAttribute('id');replacement.classList.add('rf-month-slide-sheet');replacement.inert=true;replacement.querySelectorAll('[id]').forEach(node=>node.removeAttribute('id'));replacement.querySelectorAll('[aria-controls]').forEach(node=>node.removeAttribute('aria-controls'));replacement.style.cssText=motion.incomingSheet.style.cssText;motion.incoming.replaceChildren(replacement);replacement.scrollTop=calendar.scrollTop;motion.incomingSheet=replacement;settleMonthMotion(true);}
  // Only the calendar anchor is being saved; keep the independent draft and caret usable.
  setSaving(true,{keepEditorInteractive:true});let ok=false;try{ok=await save();}catch(error){showStorageIssue(error.message||'月份未保存，请重试。');}finally{setSaving(false);}
  if(!ok){state.anchor=previous;calendarFocus=previousFocus;render();calendar.scrollTop=scroll;summary.scrollTop=summaryScroll;}return ok;
 }
 async function shiftMonth(delta){const next=Model.monthOffset(state.anchor,delta);return next?navigateToMonth(next,Math.sign(delta)):false;}
 const monthPicker=get('rf-month-picker'),monthForm=get('rf-month-form'),monthYear=get('rf-month-year'),monthNumber=get('rf-month-number');
 for(let month=1;month<=12;month++){const option=el('option','',month+' 月');option.value=String(month);monthNumber.append(option);}
 function openMonthPicker(){if(saving||get('rf-discard').open||monthPicker.open)return;cancelMonthMotion();cancelCalendarGesture();monthYear.value=String(Number(state.anchor.slice(0,4)));monthNumber.value=String(Number(state.anchor.slice(5,7)));get('rf-month-error').textContent='';monthYear.removeAttribute('aria-invalid');monthPicker.showModal();get('rf-title').setAttribute('aria-expanded','true');monthYear.focus();monthYear.select();}
 async function jumpMonth(current=false){
  if(saving)return false;let next;
  if(current)next=today.slice(0,7)+'-01';
  else{const year=monthYear.value.trim(),month=monthNumber.value;next=year.padStart(4,'0')+'-'+month.padStart(2,'0')+'-01';if(!/^\d{1,4}$/.test(year)||!monthYear.checkValidity()||!validDate(next)){get('rf-month-error').textContent='请输入 1—9999 之间的完整年份。';monthYear.setAttribute('aria-invalid','true');monthYear.focus();return false;}}
  const ok=await navigateToMonth(next);if(ok){monthPicker.close();get('rf-title').focus({preventScroll:true});}else{get('rf-month-error').textContent='月份未保存，已保留原来的排期视图。请重试。';monthYear.focus();}return ok;
 }
 get('rf-title').addEventListener('click',openMonthPicker);get('rf-month-cancel').addEventListener('click',()=>monthPicker.close());get('rf-month-current').addEventListener('click',()=>void jumpMonth(true));
 monthForm.addEventListener('submit',event=>{event.preventDefault();void jumpMonth();});monthForm.addEventListener('input',()=>{get('rf-month-error').textContent='';monthYear.removeAttribute('aria-invalid');});
 monthPicker.addEventListener('close',()=>get('rf-title').setAttribute('aria-expanded','false'));
 monthPicker.addEventListener('click',event=>{if(event.target!==monthPicker)return;const bounds=monthPicker.getBoundingClientRect();if(event.clientX<bounds.left||event.clientX>bounds.right||event.clientY<bounds.top||event.clientY>bounds.bottom)monthPicker.close();});
 function canUndoDeletion(){const active=document.activeElement;return !!deleted&&!editor&&!saving&&!active?.isContentEditable&&!active?.matches('input,textarea');}
 function refreshDate(){const next=Model.localDate();if(next===today||saving)return false;today=next;const active=document.activeElement,focusedDate=active?.dataset.date,focusedRequirement=active?.dataset.requirementId,taskIndex=Array.from(get('rf-panel').querySelectorAll('.rf-task input')).indexOf(active),nodeId=active?.closest('.rf-node-detail')?.dataset.nodeId,label=active?.textContent,scroll=get('rf-panel').scrollTop,calendarScroll=get('rf-calendar').scrollTop,focusedWeek=Array.from(get('rf-calendar').querySelectorAll('.rf-week')).indexOf(active?.closest('.rf-week'));render();get('rf-calendar').scrollTop=calendarScroll;if(state.selected&&!editor){detail(state.selected,undefined,true);get('rf-panel').scrollTop=scroll;if(nodeId)Array.from(get('rf-panel').querySelectorAll('.rf-node-detail')).find(row=>row.dataset.nodeId===nodeId)?.querySelector('input')?.focus({preventScroll:true});else if(taskIndex>=0)get('rf-panel').querySelectorAll('.rf-task input')[taskIndex]?.focus({preventScroll:true});else if(active?.tagName==='BUTTON')Array.from(get('rf-panel').querySelectorAll('button')).find(button=>button.textContent===label)?.focus({preventScroll:true});}if(focusedDate)Array.from(get('rf-calendar').querySelectorAll('.rf-date')).find(node=>node.dataset.date===focusedDate)?.focus({preventScroll:true});else if(focusedRequirement)Array.from(get('rf-calendar').querySelectorAll('.rf-week'))[focusedWeek]?.querySelectorAll('.rf-bar').forEach(node=>{if(node.dataset.requirementId===focusedRequirement)node.focus({preventScroll:true});});return true;}
 setInterval(refreshDate,60000);window.addEventListener('focus',refreshDate);document.addEventListener('visibilitychange',()=>{if(!document.hidden)refreshDate();});
 function currentSnapshot(){return Model.snapshot({version:Model.VERSION,anchor:state.anchor,requirements});}
 const revision=()=>commandSession+':'+commandVersion;
 async function executeCommand(request,fromImportDialog=false){
  try{
   if(!request||typeof request!=='object'||Array.isArray(request))throw new CalendarCommands.CommandError('INVALID_ARGUMENT','指令必须是 JSON 对象。');
   if(saving)throw new CalendarCommands.CommandError('BUSY','正在保存，请稍后重试。');
   const write=CalendarCommands.isWrite(request.action);
   if(write&&(editor?.isDirty()||get('rf-discard').open))throw new CalendarCommands.CommandError('DRAFT_DIRTY','请先保存或取消正在编辑的草稿。');
   if(write&&(monthPicker.open||dateSelection||barSelection||(!fromImportDialog&&get('rf-import-picker').open)))throw new CalendarCommands.CommandError('BUSY','正在进行日历交互，请稍后重试。');
   if(request.action==='import'&&request.mode==='replace'&&!fromImportDialog&&request.expectedRevision===undefined)throw new CalendarCommands.CommandError('INVALID_ARGUMENT','替换全部需求需要提供 expectedRevision。');
   if(write&&request.expectedRevision!==undefined&&request.expectedRevision!==revision())throw new CalendarCommands.CommandError('REVISION_CONFLICT','数据已经变化，请重新读取后再修改。');
   const result=CalendarCommands.plan(currentSnapshot(),request);
   if(result.changed){
    const previous=state.anchor,scroll=get('rf-calendar').scrollTop;state.anchor=result.snapshot.anchor;setSaving(true);
    let ok=false;try{ok=await save(result.snapshot.requirements,result.recovery);}finally{setSaving(false);}
    if(!ok){state.anchor=previous;throw new CalendarCommands.CommandError('SAVE_FAILED',get('rf-storage-error').textContent||'写入失败。');}
    requirements=result.snapshot.requirements;deleted=null;get('rf-toast').hidden=true;closePanel(true);render();if(previous===state.anchor)get('rf-calendar').scrollTop=scroll;
   }
   return {ok:true,revision:revision(),changed:result.changed,hasUnsavedChanges:!!editor?.isDirty(),data:result.data};
  }catch(error){return {ok:false,revision:revision(),error:{code:error.code||(error.name==='ValidationError'?'VALIDATION_FAILED':'INTERNAL_ERROR'),message:error.message,details:error.details??null}};}
 }
 function exportJSON(scope='all'){
  if(!['all','summary'].includes(scope))throw Error('导出范围无效。');if(saving)throw Error('正在保存，请稍后重试。');
  const items=scope==='summary'?CalendarPlanning.project(requirements,{anchor:state.anchor,today,...summaryFilter}).rows.map(row=>row.item):requirements;
  return JSON.stringify({...currentSnapshot(),requirements:items},null,2)+'\n';
 }
 function showExportStatus(message,error=false){const status=get('rf-export-status'),label=get('rf-export-message');status.hidden=!message;status.dataset.kind=error?'error':'success';status.setAttribute('role',error?'alert':'status');label.textContent=message;}
 get('rf-export-dismiss').addEventListener('click',()=>{showExportStatus('');const target=state.view==='summary'?get('rf-summary').querySelector('[data-export-json]'):get('rf-view');target?.focus({preventScroll:true});});
 async function requestJSON(scope='all'){
  if(exporting)return false;exporting=true;const active=document.activeElement,buttons=()=>root.querySelectorAll('[data-export-json]');
  const update=()=>buttons().forEach(control=>{control.disabled=exporting;control.textContent=exporting?'正在导出…':'导出 JSON';});update();
  try{
   let saved;
   if(nativeBridge)saved=(await nativeBridge.postMessage({action:'exportJSON',scope})).saved;
   else{const raw=exportJSON(scope),url=URL.createObjectURL(new Blob([raw],{type:'application/json'})),link=el('a');link.href=url;link.download='需求日历-'+today+'.json';document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);saved=true;}
   showExportStatus(saved?'已导出 JSON，包含所选范围的已保存需求。':'');return !!saved;
  }catch(error){showExportStatus('JSON 导出失败：'+error.message,true);return false;}
  finally{exporting=false;update();if(active?.isConnected&&active.matches('[data-export-json]'))active.focus({preventScroll:true});}
 }
 let importPrepared=null;
 const importPicker=get('rf-import-picker'),importForm=get('rf-import-form'),importMode=get('rf-import-mode');
 function refreshImportPreview(){
  try{const result=CalendarCommands.plan(currentSnapshot(),{action:'preview-import',data:importPrepared,mode:importMode.value});const info=result.data;get('rf-import-summary').textContent='新增 '+info.added+' 项，更新 '+info.updated+' 项，跳过 '+info.skipped+' 项。'+(info.mode==='replace'?'将替换当前全部 '+info.replaced+' 项需求；原记录会另存归档。':'当前已有需求会保留。');get('rf-import-error').textContent='';get('rf-import-go').disabled=false;get('rf-import-go').textContent=info.mode==='replace'?'确认替换全部':'确认导入';}
  catch(error){get('rf-import-error').textContent=error.message;get('rf-import-go').disabled=true;}
 }
 function previewImportJSON(raw){
  if(saving||editor?.isDirty()||monthPicker.open||get('rf-discard').open){showExportStatus('请先保存或取消当前编辑，再导入 JSON。',true);return false;}
  try{importPrepared=CalendarCommands.parseImport(raw,state.anchor);importMode.value='merge';refreshImportPreview();if(!importPicker.open)importPicker.showModal();return true;}
  catch(error){showExportStatus('JSON 导入失败：'+error.message,true);return false;}
 }
 async function requestImportJSON(){
  if(saving||editor?.isDirty()||monthPicker.open||get('rf-discard').open||importPicker.open){showExportStatus('请先保存或取消当前编辑，再导入 JSON。',true);return false;}
  if(!nativeBridge){get('rf-json-file').click();return true;}
  try{const result=await nativeBridge.postMessage({action:'pickJSON'});return result.raw===null?false:previewImportJSON(result.raw);}
  catch(error){showExportStatus('JSON 导入失败：'+error.message,true);return false;}
 }
 get('rf-json-file').addEventListener('change',async event=>{const file=event.target.files[0];event.target.value='';if(!file)return;if(file.size>16*1024*1024){showExportStatus('JSON 文件不能超过 16 MB。',true);return;}previewImportJSON(await file.text());});
 importMode.addEventListener('change',refreshImportPreview);get('rf-import-cancel').addEventListener('click',()=>importPicker.close());
 importForm.addEventListener('submit',async event=>{
  event.preventDefault();get('rf-import-go').disabled=true;
  const response=await executeCommand({action:'import',data:importPrepared,mode:importMode.value},true);
  if(response.ok){importPicker.close();showExportStatus('JSON 已导入：新增 '+response.data.added+' 项，更新 '+response.data.updated+' 项，跳过 '+response.data.skipped+' 项。');}
  else{get('rf-import-error').textContent=response.error.message;get('rf-import-go').disabled=false;}
 });
 importPicker.addEventListener('cancel',event=>{if(saving)event.preventDefault();});
 importPicker.addEventListener('close',()=>{importPrepared=null;});
 async function command(name){if(name==='discard'){if(saving)return false;get('rf-discard').close();pendingAction=null;closePanel(true);return true;}if(saving||get('rf-discard').open||monthPicker.open||get('rf-import-picker').open)return false;if(name==='exportJSON')return requestJSON();if(name==='importJSON')return requestImportJSON();if(name==='summary'){const action=()=>{closePanel(true);setView(state.view==='summary'?'month':'summary');get('rf-view').focus({preventScroll:true});};if(mayLeave(action))action();return true;}if(name==='new')edit();else if(name==='save')return editor?await editor.submit():true;else if(name==='close')closePanel();else if(name==='previous')await shiftMonth(-1);else if(name==='next')await shiftMonth(1);else if(name==='undo')return canUndoDeletion()?await undoDeletion():false;}
 window.CalendarApp={aiContext:()=>({anchor:state.anchor,selectedId:state.selected,timezone:Intl.DateTimeFormat().resolvedOptions().timeZone}),command,exportJSON,executeCommand,previewImportJSON,setReminderIssue,refreshDate,canUndoDeletion,editRequirement(id){if(!req(id)||saving)return false;edit(id);return true;},deleteRequirement,openRequirement(id){if(saving){queuedNotification=id;return true;}if(!req(id)){setReminderIssue('此提醒对应的需求已删除或不在当前数据中。');return false;}const action=()=>{setView('month');const current=req(id);if(!current){setReminderIssue('此提醒对应的需求已删除或不在当前数据中。');return;}state.anchor=current.start;render();get('rf-calendar').scrollTop=0;detail(id,undefined,true);revealCalendarRequirement(id);};if(mayLeave(action))action();return true;},hasUnsavedChanges:()=>saving||!!editor?.isDirty(),isSaving:()=>saving,exportSnapshot:()=>JSON.stringify(Model.snapshot({version:Model.VERSION,anchor:state.anchor,requirements})),async restoreSnapshot(raw){if(saving||editor?.isDirty())return false;let next;try{next=Model.snapshot(JSON.parse(raw));}catch(error){showStorageIssue(error.message);return false;}const previous=state.anchor;state.anchor=next.anchor;setSaving(true);const ok=await save(next.requirements,true);setSaving(false);if(!ok){state.anchor=previous;return false;}requirements=next.requirements;deleted=null;get('rf-toast').hidden=true;closePanel(true);render();return true;}};
 get('rf-view').addEventListener('click',()=>command('summary'));
 get('rf-close').addEventListener('click',()=>command('close'));
 window.addEventListener('keydown',event=>{if(event.isComposing||event.defaultPrevented||monthPicker.open||get('rf-import-picker').open)return;const modifier=event.metaKey||event.ctrlKey;const key=event.key.toLowerCase();if(modifier&&!event.altKey&&!event.shiftKey&&key==='f'&&state.view==='summary'&&!get('rf-discard').open){event.preventDefault();const search=get('rf-summary').querySelector('[data-summary-control=query]');search?.focus();search?.select();}else if(modifier&&!event.altKey&&!event.shiftKey&&key==='z'&&canUndoDeletion()){event.preventDefault();void command('undo');}else if(modifier&&!event.altKey&&['n','s'].includes(key)){event.preventDefault();command(key==='n'?'new':'save');}else if(modifier&&event.altKey&&['arrowleft','arrowright'].includes(key)){event.preventDefault();command(key==='arrowleft'?'previous':'next');}else if(event.key==='Escape'&&!dateSelection&&!barSelection&&!get('rf-detail').hidden&&!get('rf-discard').open){event.preventDefault();command('close');}});render();
 const calendar=get('rf-calendar');
 // Keep native scrolling inside a busy month, then use only the distance
 // beyond its edge. Direction changes start a new gesture even during momentum.
 let monthWheelTime=-Infinity,monthWheelDistance=0,monthWheelDirection=0,monthWheelLocked=false;
 let monthWheelLast=0,monthWheelPeak=0,monthWheelDecayed=false,monthWheelTurnTime=-Infinity;
 let monthWheelNavigation=null,monthWheelPending=null;
 const monthWheelBlocked=()=>state.view!=='month'||monthPicker.open||get('rf-import-picker').open||get('rf-discard').open||dateSelection||barSelection;
 function commitWheelMonth(next,direction){
  if(monthWheelNavigation){monthWheelPending={next,direction,anchor:state.anchor};return;}
  monthWheelPending=null;
  const navigation=navigateToMonth(next,direction);monthWheelNavigation=navigation;
  void navigation.then(ok=>{
   if(monthWheelNavigation!==navigation)return;monthWheelNavigation=null;
   const pending=monthWheelPending;monthWheelPending=null;
   if(ok&&pending&&pending.anchor===state.anchor&&!saving&&!monthWheelBlocked())commitWheelMonth(pending.next,pending.direction);
  },()=>{monthWheelNavigation=null;monthWheelPending=null;});
 }
 calendar.addEventListener('wheel',event=>{
  if(event.defaultPrevented||event.ctrlKey||event.metaKey||event.altKey||event.shiftKey||!event.deltaY||Math.abs(event.deltaX)>=Math.abs(event.deltaY))return;
  const unit=event.deltaMode===1?20:event.deltaMode===2?calendar.clientHeight:1;
  const delta=event.deltaY*unit,magnitude=Math.abs(delta),direction=Math.sign(delta),now=performance.now();
  // Subpixel tail noise must not keep extending a lock or reverse a gesture.
  if(magnitude<.5)return;
  const reversed=direction!==monthWheelDirection;
  if(reversed&&magnitude<2&&now-monthWheelTime<180)return;
  const renewed=monthWheelLocked&&monthWheelDecayed&&now-monthWheelTurnTime>100&&magnitude>=Math.max(10,monthWheelLast*2,monthWheelPeak*.4);
  if(now-monthWheelTime>180||reversed||renewed){
   monthWheelDistance=0;monthWheelLocked=false;monthWheelPeak=0;monthWheelDecayed=false;monthWheelDirection=direction;
  }
  monthWheelTime=now;monthWheelLast=magnitude;monthWheelPeak=Math.max(monthWheelPeak,magnitude);
  if(monthWheelLocked&&magnitude<=Math.max(4,monthWheelPeak*.3))monthWheelDecayed=true;
  if(monthWheelBlocked()||(saving&&!monthWheelNavigation)){
   if(monthMotion||monthWheelLocked)event.preventDefault();
   monthWheelDistance=0;monthWheelLocked=true;monthWheelPending=null;return;
  }
  const maxScroll=Math.max(0,calendar.scrollHeight-calendar.clientHeight),scroll=Math.max(0,Math.min(maxScroll,calendar.scrollTop));
  const remaining=direction<0?scroll:maxScroll-scroll;
  // Allow content to scroll immediately after a turn, including its momentum.
  if(remaining>2&&magnitude<=remaining){
   cancelMonthMotion();monthWheelDistance=0;return;
  }
  event.preventDefault();
  // Even a locked momentum tail must be able to reach the content boundary.
  if(remaining>2){calendar.scrollTop=direction<0?0:maxScroll;cancelMonthMotion();}
  if(monthWheelLocked)return;
  if(monthMotion?.phase==='settling'){
   for(const animation of monthMotion.animations)animation.finish();cancelMonthMotion();
  }else if(monthMotion?.phase==='returning'||monthMotion&&monthMotion.direction!==direction)cancelMonthMotion();
  // Native scrolling would clamp here and discard the overflow. Apply the
  // interior portion ourselves so this very event can also begin a page turn.
  monthWheelDistance+=Math.max(0,magnitude-(remaining>2?remaining:0));
  const next=Model.monthOffset(state.anchor,direction);
  if(!next){cancelMonthMotion();monthWheelLocked=true;return;}
  if(!monthWheelNavigation)previewMonthMotion(direction,next,monthWheelDistance);
  if(monthWheelDistance<60)return;
  monthWheelLocked=true;monthWheelTurnTime=now;monthWheelDecayed=false;
  commitWheelMonth(next,direction);
 },{passive:false});
 calendar.addEventListener('pointerdown',cancelMonthMotion,{capture:true});
 calendar.addEventListener('keydown',cancelMonthMotion,{capture:true});
 window.addEventListener('resize',cancelMonthMotion);
 document.addEventListener('visibilitychange',()=>{if(document.hidden)cancelMonthMotion();});
 matchMedia('(prefers-reduced-motion:reduce)').addEventListener('change',cancelMonthMotion);
 const bandAt=node=>{const bar=node?.closest?.('.rf-bar');return bar&&calendar.contains(bar)?bar:null;};
 calendar.addEventListener('pointerover',event=>{if(event.pointerType==='touch'||barSelection?.dragged||saving)return;const bar=bandAt(event.target);if(bar)markBandState('is-hovered',bar.dataset.requirementId);});
 calendar.addEventListener('pointerout',event=>{const bar=bandAt(event.target);if(bar&&bandAt(event.relatedTarget)?.dataset.requirementId!==bar.dataset.requirementId)markBandState('is-hovered',null);});
 calendar.addEventListener('focusin',event=>{const bar=bandAt(event.target);markBandState('is-focused',bar?.dataset.requirementId);});
 calendar.addEventListener('focusout',event=>{if(bandAt(event.target))markBandState('is-focused',bandAt(event.relatedTarget)?.dataset.requirementId);});
 calendar.addEventListener('contextmenu',event=>{const bar=event.target.closest('.rf-bar');if(!nativeBridge||!bar||saving)return;event.preventDefault();nativeBridge.postMessage({action:'contextMenu',id:bar.dataset.requirementId}).catch(()=>showStorageIssue('无法打开需求菜单，请点击需求查看详情。'));});
 calendar.addEventListener('keydown',async event=>{
  const cell=event.target.closest('.rf-date');if(!cell||saving||event.isComposing||event.metaKey||event.ctrlKey||event.altKey||event.shiftKey)return;
  if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End','PageUp','PageDown'].includes(event.key))return;event.preventDefault();
  const date=Model.calendarMove(cell.dataset.date,event.key);if(!date)return;let target;
  if(['PageUp','PageDown'].includes(event.key)||!Array.from(calendar.querySelectorAll('.rf-date')).some(node=>node.dataset.date===date)){
   const ok=await navigateToMonth(date);target=Array.from(calendar.querySelectorAll('.rf-date')).find(node=>node.dataset.date===(ok?date:cell.dataset.date));
  }else target=Array.from(calendar.querySelectorAll('.rf-date')).find(node=>node.dataset.date===date);
  target?.focus({preventScroll:true});target?.querySelector('span')?.scrollIntoView({block:'nearest',inline:'nearest'});
 });
 calendar.addEventListener('focusin',event=>{const cell=event.target.closest('.rf-date[data-date]');if(!cell)return;calendarFocus.date=cell.dataset.date;for(const date of calendar.querySelectorAll('.rf-date[data-date]'))date.tabIndex=date===cell?0:-1;});
 function paintDateSelection(range=dateSelection){
  const start=range?(range.start<range.end?range.start:range.end):null;
  const end=range?(range.start>range.end?range.start:range.end):null;
  for(const week of calendar.querySelectorAll('.rf-week')){
   const dates=Array.from(week.querySelectorAll('.rf-date'),button=>button.dataset.date),first=dates.findIndex(date=>start&&date>=start&&date<=end);
   let preview=week.querySelector('.rf-range-preview');if(first<0){preview?.classList.remove('is-visible');continue;}
   const last=dates.findLastIndex(date=>date>=start&&date<=end);if(!preview){const anchor=el('div','rf-range-anchor');preview=el('div','rf-range-preview');anchor.setAttribute('aria-hidden','true');anchor.append(preview);week.append(anchor);}
   const visible=preview.classList.contains('is-visible');for(const tone of Model.TONES.map(tone=>tone.id).filter(Boolean))preview.classList.toggle(tone,range.tone===tone);applyTone(preview,range.tone,'range');preview.style.left='calc('+(first/7*100)+'% + 3px)';preview.style.width='calc('+((last-first+1)/7*100)+'% - 6px)';
   preview.classList.toggle('continues-left',start<dates[0]);preview.classList.toggle('continues-right',end>dates[6]);if(!visible)void preview.offsetWidth;preview.classList.add('is-visible');
  }
 }
 // Keep the last valid range while either date is still being entered.
 function updateDraftPreview(start,end,tone=''){if(!validDate(start)||!validDate(end)||end<start)return;draftPreview={start,end,tone};paintDateSelection(draftPreview);}
 function clearDraftPreview(){draftPreview=null;paintDateSelection(null);}
 function dateAtPoint(x,y){
  const viewport=calendar.getBoundingClientRect();if(x<viewport.left||x>=viewport.right||y<viewport.top||y>=viewport.bottom)return null;
  const heading=calendar.querySelector('.rf-weekdays').getBoundingClientRect();if(y>=heading.top&&y<heading.bottom)return null;
  for(const week of calendar.querySelectorAll('.rf-week')){const bounds=week.getBoundingClientRect();if(x<bounds.left||x>=bounds.right||y<bounds.top||y>=bounds.bottom)continue;const index=Math.min(6,Math.floor((x-bounds.left)/bounds.width*7));return week.querySelectorAll('.rf-date')[index]?.dataset.date??null;}return null;
 }
 function clearDateSelection(keepPreview=false){const selection=dateSelection;dateSelection=null;if(keepPreview!==true)paintDateSelection(draftPreview);if(selection?.button.hasPointerCapture(selection.pointerId))selection.button.releasePointerCapture(selection.pointerId);}
 function cancelDateSelection(){if(!dateSelection)return;cancelledDatePointer=dateSelection.pointerId;suppressDateClickUntil=performance.now()+400;clearDateSelection();}
 function clearBarSelection(keepPreview=false){
  const selection=barSelection;barSelection=null;cancelAnimationFrame(replanFrame);replanFrame=0;
  root.classList.remove('is-replanning','is-replan-invalid');calendar.querySelectorAll('.rf-bar.is-moving,.rf-bar.is-pressed').forEach(bar=>bar.classList.remove('is-moving','is-pressed'));
  if(!keepPreview)paintDateSelection(draftPreview);
  if(selection?.button.hasPointerCapture(selection.pointerId))selection.button.releasePointerCapture(selection.pointerId);
 }
 function cancelBarSelection(){if(!barSelection)return;cancelledDatePointer=barSelection.pointerId;suppressDateClickUntil=performance.now()+400;clearBarSelection();}
 function markBandState(className,id){get('rf-calendar').querySelectorAll('.rf-bar').forEach(bar=>bar.classList.toggle(className,!!id&&bar.dataset.requirementId===id));}
 function cancelCalendarGesture(){cancelDateSelection();cancelBarSelection();for(const name of ['is-hovered','is-focused','is-pressed'])markBandState(name,null);}
 function shiftedAtPoint(selection,x,y){
  const date=dateAtPoint(x,y);if(!date)return null;
  const offset=days(selection.origin,date);
  if(selection.cachedOffset===offset)return selection.cachedShift;
  selection.cachedOffset=offset;
  try{selection.cachedShift={offset,item:Model.shiftRequirement(selection.original,offset)};}catch{selection.cachedShift=null;}
  return selection.cachedShift;
 }
 function updateBarPreview(x,y){
  if(!barSelection?.dragged)return;
  const shifted=shiftedAtPoint(barSelection,x,y);root.classList.toggle('is-replan-invalid',!shifted);
  if(!shifted)return;
  if(barSelection.offset===shifted.offset)return;
  barSelection.offset=shifted.offset;paintDateSelection(shifted.item);
  get('rf-feedback').textContent=barSelection.original.title+'：'+rangeText(shifted.item.start,shifted.item.end);
 }
 // Scroll only while the held pointer is near an edge. Re-hit-test after each
 // scroll so the preview follows dates, rather than stale screen coordinates.
 function scrollReplan(){
  replanFrame=0;if(!barSelection?.dragged)return;
  const {x,y}=barSelection.point,bounds=calendar.getBoundingClientRect(),top=calendar.querySelector('.rf-weekdays').getBoundingClientRect().bottom;
  if(x<bounds.left||x>=bounds.right||y<top||y>=bounds.bottom)return;
  const distance=y<top+30?y-top-30:y>bounds.bottom-30?y-bounds.bottom+30:0;
  if(!distance)return;
  const previous=calendar.scrollTop;calendar.scrollTop+=Math.sign(distance)*Math.min(12,Math.abs(distance)/2);
  if(previous===calendar.scrollTop)return;
  updateBarPreview(x,y);replanFrame=requestAnimationFrame(scrollReplan);
 }
 calendar.addEventListener('pointerdown',event=>{
  const bar=event.target.closest?.('.rf-bar');
  if(bar&&calendar.contains(bar)&&event.button===0&&event.isPrimary!==false&&!saving&&!dateSelection&&!barSelection&&!get('rf-discard').open){
   if(editor?.isDirty())return;
   const origin=dateAtPoint(event.clientX,event.clientY),original=req(bar.dataset.requirementId);if(!origin||!original)return;
   cancelledDatePointer=null;suppressDateClickUntil=0;
   barSelection={button:bar,pointerId:event.pointerId,original,origin,x:event.clientX,y:event.clientY,point:{x:event.clientX,y:event.clientY},dragged:false,offset:null};
   markBandState('is-pressed',original.id);bar.setPointerCapture(event.pointerId);return;
  }
  const button=event.target.closest?.('.rf-date');if(!button?.dataset.date||!calendar.contains(button)||event.button!==0||event.isPrimary===false||saving||dateSelection||barSelection||editor?.isDirty()||get('rf-discard').open)return;
  cancelledDatePointer=null;suppressDateClickUntil=0;dateSelection={start:button.dataset.date,end:button.dataset.date,tone:nextRequirementTone(),pointerId:event.pointerId,button,dragged:false};button.setPointerCapture(event.pointerId);paintDateSelection();
 });
 calendar.addEventListener('pointermove',event=>{
  if(barSelection?.pointerId===event.pointerId){
   barSelection.point={x:event.clientX,y:event.clientY};
   if(!barSelection.dragged&&Math.hypot(event.clientX-barSelection.x,event.clientY-barSelection.y)<6)return;
   if(!barSelection.dragged){barSelection.dragged=true;markBandState('is-pressed',null);markBandState('is-hovered',null);root.classList.add('is-replanning');calendar.querySelectorAll('.rf-bar').forEach(bar=>bar.classList.toggle('is-moving',bar.dataset.requirementId===barSelection.original.id));}
   event.preventDefault();updateBarPreview(event.clientX,event.clientY);if(!replanFrame)replanFrame=requestAnimationFrame(scrollReplan);return;
  }
  if(!dateSelection||dateSelection.pointerId!==event.pointerId)return;const date=dateAtPoint(event.clientX,event.clientY);if(!date||date===dateSelection.end)return;dateSelection.end=date;dateSelection.dragged=true;paintDateSelection();
 });
 calendar.addEventListener('pointerup',event=>{
  if(barSelection?.pointerId===event.pointerId){
   const selected=barSelection,dragged=selected.dragged||Math.hypot(event.clientX-selected.x,event.clientY-selected.y)>=6,shifted=dragged&&!editor?.isDirty()?shiftedAtPoint(selected,event.clientX,event.clientY):null;
   if(dragged){event.preventDefault();suppressDateClickUntil=performance.now()+400;}
   clearBarSelection(!!shifted&&shifted.offset!==0);
   if(shifted&&shifted.offset!==0){edit(selected.original.id,undefined,undefined,'basic',false,null,shifted.offset);get('rf-feedback').textContent='已调整排期，保存后生效：'+rangeText(shifted.item.start,shifted.item.end);}
   return;
  }
  if(!dateSelection){if(cancelledDatePointer===event.pointerId){event.preventDefault();cancelledDatePointer=null;suppressDateClickUntil=performance.now()+400;}return;}if(dateSelection.pointerId!==event.pointerId)return;const selected=dateSelection,releaseDate=dateAtPoint(event.clientX,event.clientY);if(!releaseDate){event.preventDefault();suppressDateClickUntil=performance.now()+400;clearDateSelection();return;}
  selected.end=releaseDate;selected.dragged=selected.dragged||releaseDate!==selected.start;
  const start=selected.start<selected.end?selected.start:selected.end,end=selected.start>selected.end?selected.start:selected.end;
  if(selected.dragged){event.preventDefault();suppressDateClickUntil=performance.now()+400;}
  clearDateSelection(true);if(selected.dragged){get('rf-feedback').textContent='已选择 '+format(start)+' 至 '+format(end);edit(null,start,end,'basic',false,selected.tone);}
 });
 calendar.addEventListener('click',event=>{if(performance.now()<suppressDateClickUntil&&event.target.closest?.('.rf-date,.rf-bar')){event.preventDefault();event.stopImmediatePropagation();}},true);
 const cancelPointerGesture=event=>{if(event.pointerId===dateSelection?.pointerId||event.pointerId===barSelection?.pointerId)cancelCalendarGesture();};
 calendar.addEventListener('pointercancel',cancelPointerGesture);calendar.addEventListener('lostpointercapture',cancelPointerGesture);
 root.addEventListener('keydown',event=>{if(event.key==='Escape'&&(dateSelection||barSelection)){event.preventDefault();cancelCalendarGesture();}});window.addEventListener('blur',cancelCalendarGesture);


 const syncPanelHeight=()=>{root.style.setProperty('--rf-calendar-height',Math.max(260,get('rf-calendar').getBoundingClientRect().height)+'px');editor?.resizeNote();};syncPanelHeight();if(globalThis.ResizeObserver)new ResizeObserver(syncPanelHeight).observe(get('rf-calendar'));
})();
