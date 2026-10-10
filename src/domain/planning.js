/* Read-only planning projections shared by summaries and JSON export. */
(function(scope){
 'use strict';
 const Model=typeof module!=='undefined'&&module.exports?require('./model.js'):scope.CalendarModel;
 const STATUS=Object.freeze({active:'进行中',upcoming:'未开始',past:'计划已结束',completed:'已完成'});
 function progress(item){const total=item.tasks.length,done=item.done.filter(Boolean).length;return {total,done,ratio:total?done/total:null};}
 function nodeProgress(item){const total=item.milestones.length,done=item.milestones.filter(node=>node.done).length;return {total,done};}
 function status(item,today){
  const p=progress(item),hasWork=p.total+item.milestones.length>0;
  if(hasWork&&p.done===p.total&&item.milestones.every(node=>node.done))return 'completed';
  return today<item.start?'upcoming':today>item.end?'past':'active';
 }
 function currentPhase(item,today){return item.phases.find(phase=>phase.start<=today&&phase.end>=today)?.name||'';}
 function nextNode(item,today){return item.milestones.filter(node=>!node.done).sort((a,b)=>a.date.localeCompare(b.date)||a.id.localeCompare(b.id))[0]||null;}
 function firstFreePhaseDate({start,end},phases){
  if(!Model.validDate(start)||!Model.validDate(end)||end<start||phases.some(phase=>!Model.validDate(phase.start)||!Model.validDate(phase.end)||phase.end<phase.start))return '';
  let date=start;
  for(const phase of [...phases].sort((a,b)=>a.start.localeCompare(b.start))){
   if(phase.end<date)continue;if(phase.start>date)break;
   try{date=Model.add(phase.end,1);}catch{return '';}
   if(date>end)return '';
  }
  return date;
 }
 function defaultNodeDate({start,end},today){
  if(!Model.validDate(start)||!Model.validDate(end)||!Model.validDate(today)||end<start)return '';
  return today<start?start:today>end?end:today;
 }
 function nodeStatus(node,today){return node.done?'completed':node.date<today?'overdue':node.date===today?'today':'upcoming';}
 function projectNodes(items,{anchor,today=Model.localDate(),kind='all',period='all',completion='pending'}={}){
  const source=items.flatMap(item=>item.milestones.map(node=>({item,node}))),month=Model.monthGrid(anchor);
  let end=today;if(period==='7'||period==='30'){try{end=Model.add(today,Number(period)-1);}catch{end='9999-12-31';}}
  const nodes=source.filter(({node})=>{
   if(kind!=='all'&&node.kind!==kind)return false;
   if(completion==='pending'&&node.done||completion==='completed'&&!node.done)return false;
   if(period==='overdue')return !node.done&&node.date<today;
   if(period==='7'||period==='30')return node.date>=today&&node.date<=end;
   if(period==='month')return node.date>=month.first&&node.date<=month.last;
   return true;
  }).sort((a,b)=>a.node.date.localeCompare(b.node.date)||a.item.title.localeCompare(b.item.title)||a.node.id.localeCompare(b.node.id));
  return {nodes,total:source.length};
 }
 function project(items,{anchor,today=Model.localDate(),scope='month',query='',tone='all',state='all',sort='start'}={}){
  const month=Model.monthGrid(anchor),terms=query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  const inScope=items.filter(item=>scope==='all'||item.start<=month.last&&item.end>=month.first);
  const searched=inScope.filter(item=>{
   if(tone!=='all'&&item.tone!==tone)return false;
   const content=[item.title,item.note,...item.tasks,...item.phases.map(value=>value.name),...item.milestones.map(value=>value.name),...item.resources.flatMap(value=>[value.name,value.type,value.url])].join('\n').toLocaleLowerCase();
   return terms.every(term=>content.includes(term));
  });
  const counts={all:searched.length,active:0,upcoming:0,past:0,completed:0};for(const item of searched)counts[status(item,today)]++;
  const rows=searched.filter(item=>state==='all'||status(item,today)===state).map(item=>({item,status:status(item,today),phase:currentPhase(item,today),progress:progress(item),nodes:nodeProgress(item),next:nextNode(item,today)}));
  rows.sort((a,b)=>{
   let order;
   if(sort==='end')order=a.item.end.localeCompare(b.item.end);
   else if(sort==='progress')order=(a.progress.ratio??2)-(b.progress.ratio??2);
   else if(sort==='next')order=a.next&&b.next?a.next.date.localeCompare(b.next.date):a.next?-1:b.next?1:0;
   else order=a.item.start.localeCompare(b.item.start);
   return order||a.item.title.localeCompare(b.item.title)||a.item.id.localeCompare(b.item.id);
  });
  const nodes=rows.flatMap(({item})=>item.milestones.filter(node=>!node.done).map(node=>({item,node}))).sort((a,b)=>a.node.date.localeCompare(b.node.date)||a.item.title.localeCompare(b.item.title)||a.node.id.localeCompare(b.node.id));
  return {rows,nodes,counts,scopeCount:inScope.length};
 }
 const api={STATUS,progress,nodeProgress,status,currentPhase,nextNode,firstFreePhaseDate,defaultNodeDate,nodeStatus,projectNodes,project};
 if(typeof module!=='undefined'&&module.exports)module.exports=api;else scope.CalendarPlanning=api;
})(globalThis);
