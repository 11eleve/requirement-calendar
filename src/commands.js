/* Shared JSON and command rules. Mutation plans have no storage or UI side effects. */
(function(scope){
 'use strict';
 const Model=typeof module!=='undefined'&&module.exports?require('./model.js'):scope.CalendarModel;
 const fields=['id','title','tone','start','end','phases','milestones','resources','tasks','done','note','reminder'];
 const actions=['list','get','create','update','shift','delete','import','export','preview-import','schema','status'];
 const writes=new Set(['create','update','shift','delete','import']);
 class CommandError extends Error{constructor(code,message,details){super(message);this.code=code;this.details=details;}}
 const fail=(code,message,details)=>{throw new CommandError(code,message,details);};
 function object(value,label){if(!value||typeof value!=='object'||Array.isArray(value))fail('INVALID_ARGUMENT',label+'必须是 JSON 对象。');return value;}
 function normalize(value){
  object(value,'需求');
  for(const key of Object.keys(value))if(!fields.includes(key)&&key!=='short')fail('INVALID_ARGUMENT','未知需求字段：'+key);
  const tasks=value.tasks??[],milestones=value.milestones??[];
  if(!Array.isArray(tasks)||!Array.isArray(milestones))fail('INVALID_ARGUMENT','事项和时间节点必须是数组。');
  return Model.requirement({...value,id:value.id??Model.newId(),phases:value.phases??[],resources:value.resources??[],tasks,done:value.done??tasks.map(()=>false),milestones:milestones.map(node=>{object(node,'时间节点');return {...node,id:node.id??Model.newId(),kind:node.kind??'checkpoint'};}),note:value.note??''});
 }
 function parseImport(raw,anchor){
  let value=raw;
  if(typeof raw==='string'){if(new TextEncoder().encode(raw).length>16*1024*1024)fail('TOO_LARGE','JSON 文件不能超过 16 MB。');try{value=JSON.parse(raw.replace(/^\uFEFF/,''));}catch{fail('INVALID_JSON','JSON 语法无效。');}}
  let records;
  if(Array.isArray(value))records=value;
  else{object(value,'导入内容');if(value.version!==undefined&&![4,5,6,Model.VERSION].includes(value.version))fail('UNSUPPORTED_VERSION','JSON 数据版本不受支持。');records=value.requirements??(value.title!==undefined?[value]:null);if(value.anchor!==undefined)anchor=value.anchor;}
  if(!Array.isArray(records))fail('INVALID_ARGUMENT','需要需求数组、单个需求或包含 requirements 的备份。');
  const requirements=records.map((record,index)=>{try{return normalize(record);}catch(error){fail('VALIDATION_FAILED','第 '+(index+1)+' 个需求：'+error.message,{index,path:error.path});}});
  return Model.snapshot({version:Model.VERSION,anchor,requirements});
 }
 function selected(snapshot,request){
  for(const field of ['from','to'])if(request[field]!==undefined&&!Model.validDate(request[field]))fail('INVALID_ARGUMENT',field+' 必须是 YYYY-MM-DD。');
  if(request.from&&request.to&&request.from>request.to)fail('INVALID_ARGUMENT','from 不能晚于 to。');
  if(request.ids!==undefined&&(!Array.isArray(request.ids)||!request.ids.every(id=>typeof id==='string')))fail('INVALID_ARGUMENT','ids 必须是 ID 数组。');
  if(request.query!==undefined&&typeof request.query!=='string')fail('INVALID_ARGUMENT','query 必须是文字。');
  const query=(request.query??'').toLocaleLowerCase();
  return snapshot.requirements.filter(item=>(!request.from||item.end>=request.from)&&(!request.to||item.start<=request.to)&&(!request.ids||request.ids.includes(item.id))&&(!query||JSON.stringify(item).toLocaleLowerCase().includes(query)));
 }
 function schema(){
  const date={type:'string',pattern:'^[0-9]{4}-[0-9]{2}-[0-9]{2}$'},namedPeriod={type:'object',required:['name','start','end'],properties:{name:{type:'string'},start:date,end:date}};
  const requirementSchema={type:'object',additionalProperties:false,required:['title','start','end'],properties:{id:{type:'string'},title:{type:'string',minLength:1},start:date,end:date,tone:{enum:Model.TONES.map(tone=>tone.id)},phases:{type:'array',items:namedPeriod},milestones:{type:'array',items:{type:'object',required:['name','date'],properties:{id:{type:'string'},name:{type:'string'},date,kind:{enum:Model.NODE_KINDS.map(kind=>kind.id)},done:{type:'boolean'}}}},resources:{type:'array',items:{type:'object',required:['name'],properties:{name:{type:'string'},type:{type:'string'},url:{type:'string'}}}},tasks:{type:'array',items:{type:'string'}},done:{type:'array',items:{type:'boolean'}},note:{type:'string'},reminder:{type:['string','null']}}};
  return {version:Model.VERSION,commands:actions,requiredFields:['title','start','end'],optionalFields:fields.filter(key=>!['title','start','end'].includes(key)),requirementSchema,dateFormat:'YYYY-MM-DD',importModes:{merge:'新增 ID；已有 ID 跳过（默认）',update:'新增或按 ID 更新完整需求',copy:'生成新 ID 后添加',replace:'替换全部需求，并归档原记录'},example:{title:'登录优化',start:'2026-10-12',end:'2026-10-16',tasks:['实现登录接口','验收'],note:'可省略空栏目；自动生成 ID 和完成状态。'},concurrency:'读取返回 revision；修改时可提供 expectedRevision。未保存草稿存在时拒绝写入。更新数组字段时须完整提供；tasks 与 done 的长度须相同。'};
 }

 function plan(raw,request){
  const snapshot=Model.snapshot(raw);object(request,'指令');
  if(!actions.includes(request.action))fail('UNKNOWN_COMMAND','未知指令：'+String(request.action));
  let next=snapshot,data,changed=false,recovery=false;
  const locate=()=>{if(typeof request.id!=='string')fail('INVALID_ARGUMENT','需要需求 ID。');const item=snapshot.requirements.find(item=>item.id===request.id);if(!item)fail('NOT_FOUND','找不到需求：'+request.id);return item;};
  switch(request.action){
   case 'schema':data=schema();break;
   case 'status':data={count:snapshot.requirements.length,anchor:snapshot.anchor};break;
   case 'list':data=selected(snapshot,request);break;
   case 'get':data=locate();break;
   case 'export':data={...snapshot,requirements:selected(snapshot,request)};break;
   case 'create':{const item=normalize(request.data);if(snapshot.requirements.some(row=>row.id===item.id))fail('ALREADY_EXISTS','需求 ID 已存在：'+item.id);next={...snapshot,requirements:[...snapshot.requirements,item]};data=item;changed=true;break;}
   case 'update':{const item=locate(),patch=object(request.data,'修改内容');if(patch.id!==undefined&&patch.id!==item.id)fail('INVALID_ARGUMENT','修改需求时不能更换 ID。');const updated=normalize({...item,...patch,id:item.id});next={...snapshot,requirements:snapshot.requirements.map(row=>row.id===item.id?updated:row)};data=updated;changed=JSON.stringify(item)!==JSON.stringify(updated);break;}
   case 'shift':{const item=locate();if(!Number.isSafeInteger(request.days))fail('INVALID_ARGUMENT','days 必须是整数。');const shifted=Model.shiftRequirement(item,request.days);if(!shifted)fail('VALIDATION_FAILED','调整后的日期超出支持范围。');next={...snapshot,requirements:snapshot.requirements.map(row=>row.id===item.id?shifted:row)};data=shifted;changed=request.days!==0;break;}
   case 'delete':{const item=locate();next={...snapshot,requirements:snapshot.requirements.filter(row=>row.id!==item.id)};data={id:item.id,deleted:true};changed=true;break;}
   case 'import':case 'preview-import':{
    const incoming=parseImport(request.data,snapshot.anchor),mode=request.mode??'merge';if(!['merge','update','copy','replace'].includes(mode))fail('INVALID_ARGUMENT','导入模式无效。');
    const items=mode==='replace'?[]:[...snapshot.requirements],indexes=new Map(items.map((item,index)=>[item.id,index]));let added=0,updated=0,skipped=0;
    for(let item of incoming.requirements){if(mode==='copy')item=normalize({...item,id:Model.newId()});const index=indexes.get(item.id);if(index===undefined){indexes.set(item.id,items.length);items.push(item);added++;}else if(mode==='update'){items[index]=item;updated++;}else skipped++;}
    next=Model.snapshot({...snapshot,anchor:mode==='replace'?incoming.anchor:snapshot.anchor,requirements:items});
    data={mode,added,updated,skipped,replaced:mode==='replace'?snapshot.requirements.length:0,total:items.length,prepared:incoming};
    changed=request.action==='import'&&JSON.stringify(next)!==JSON.stringify(snapshot);recovery=mode==='replace';break;
   }
  }
  return {snapshot:next,data,changed,recovery};
 }
 const api={CommandError,plan,parseImport,schema,isWrite:action=>writes.has(action)};
 if(typeof module!=='undefined'&&module.exports)module.exports=api;else scope.CalendarCommands=api;
})(globalThis);
