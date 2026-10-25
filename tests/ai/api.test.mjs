import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import Commands from '../../src/domain/commands.js';
import {CalendarAI} from '../../desktop/ai/service.mjs';

async function fixture(t){
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'calendar-api-'));let snapshot={version:7,anchor:'2026-10-26',requirements:[]},version=0,dirty=false;
 const ai=new CalendarAI({directory,dispatch:async request=>{
  if(Commands.isWrite(request.action)&&dirty)return {ok:false,error:{code:'DRAFT_DIRTY',message:'请先保存草稿。'}};
  if(request.expectedRevision!==undefined&&request.expectedRevision!==String(version))return {ok:false,error:{code:'REVISION_CONFLICT',message:'数据已经变化。'}};
  try{const result=Commands.plan(snapshot,request);if(result.changed){snapshot=result.snapshot;version++;await fs.writeFile(path.join(directory,'calendar.json'),JSON.stringify(snapshot));}return {ok:true,revision:String(version),data:result.data,changed:result.changed};}
  catch(error){return {ok:false,error:{code:error.code??'VALIDATION_FAILED',message:error.message}};}
 }});
 await ai.start();t.after(async()=>{await ai.close();await fs.rm(directory,{recursive:true,force:true});});
 const request=async(route,{method='GET',body,token=ai.apiToken,headers={}}={})=>{
  const response=await fetch(ai.origin+route,{method,headers:{Authorization:'Bearer '+token,...body!==undefined?{'Content-Type':'application/json'}:{},...headers},...body!==undefined?{body:JSON.stringify(body)}:{}});
  return {status:response.status,body:await response.json()};
 };
 return {ai,directory,request,setDirty:value=>{dirty=value;}};
}
test('local HTTP API authenticates, checks rights and revisions, and reuses persisted command rules',async t=>{
 const {ai,directory,request,setDirty}=await fixture(t);
 assert.equal((await request('/v1/status')).status,403);
 await ai.request({method:'configure',settings:{...ai.config,apiEnabled:true}});
 assert.equal((await request('/v1/status',{token:'wrong'})).status,401);
 assert.equal((await request('/v1/status',{headers:{Origin:'https://attacker.invalid'}})).status,403);
 const status=await request('/v1/status');assert.equal(status.status,200);assert.equal(status.body.revision,'0');
 const data={id:'api-item',title:'接口创建',start:'2026-10-26',end:'2026-10-30'};
 assert.equal((await request('/v1/requirements',{method:'POST',body:data})).status,409);
 assert.equal((await request('/v1/requirements',{method:'POST',body:data,headers:{'If-Match':'0'}})).status,403);
 await ai.request({method:'configure',settings:{...ai.config,permissions:{read:true,create:true,update:true,delete:false}}});
 const created=await request('/v1/requirements',{method:'POST',body:data,headers:{'If-Match':'"0"'}});assert.equal(created.status,200);assert.equal(created.body.data.id,data.id);
 assert.equal(JSON.parse(await fs.readFile(path.join(directory,'calendar.json'),'utf8')).requirements[0].title,data.title);
 assert.equal((await request('/v1/requirements/api-item',{method:'PATCH',body:{note:'stale'},headers:{'If-Match':'0'}})).status,409);
 setDirty(true);assert.equal((await request('/v1/requirements/api-item',{method:'PATCH',body:{note:'blocked'},headers:{'If-Match':'1'}})).body.error.code,'DRAFT_DIRTY');setDirty(false);
 const updated=await request('/v1/requirements/api-item',{method:'PATCH',body:{note:'接口已确认'},headers:{'If-Match':'1'}});assert.equal(updated.body.data.note,'接口已确认');
 const shifted=await request('/v1/requirements/api-item/shift',{method:'POST',body:{days:2},headers:{'If-Match':'2'}});assert.equal(shifted.body.data.start,'2026-10-28');
 assert.equal((await request('/v1/requirements?query=接口')).body.data.length,1);
 assert.equal((await request('/v1/requirements/api-item',{method:'DELETE',headers:{'If-Match':'3'}})).status,403);
 await ai.request({method:'configure',settings:{...ai.config,permissions:{...ai.config.permissions,delete:true}}});
 assert.equal((await request('/v1/requirements/api-item',{method:'DELETE',headers:{'If-Match':'3'}})).status,200);
 assert.equal(JSON.parse(await fs.readFile(path.join(directory,'calendar.json'),'utf8')).requirements.length,0);
 const previous=ai.apiToken;await ai.request({method:'rotateToken'});assert.equal((await request('/v1/status',{token:previous})).status,401);
 assert.equal((await request('/v1/schema')).body.data.version,7);
});
test('permission revocation is immediate during an active turn; invalid or cross-host requests fail closed',async t=>{
 const {ai,request}=await fixture(t);
 await ai.request({method:'configure',settings:{...ai.config,apiEnabled:true,permissions:{read:true,create:true,update:true,delete:true}}});
 ai.busy=true;
 await ai.request({method:'configure',settings:{...ai.config,permissions:{read:false,create:false,update:false,delete:false}}});
 assert.equal((await request('/v1/status')).status,403);
 await assert.rejects(()=>ai.execute({action:'create',data:{}},{revision:'0'}),/尚未授权/);
 await assert.rejects(()=>ai.request({method:'configure',settings:{...ai.config,model:'another-model'}}),/先停止/);
 ai.busy=false;
 const response=await new Promise((resolve,reject)=>{const req=http.get(ai.origin+'/v1/status',{headers:{Host:'evil.invalid',Authorization:'Bearer '+ai.apiToken}},res=>{let raw='';res.on('data',c=>{raw+=c;});res.on('end',()=>resolve({status:res.statusCode,body:JSON.parse(raw)}));});req.on('error',reject);});
 assert.equal(response.status,403);
 assert.equal((await request('/v1/requirements',{method:'POST',body:null,headers:{'If-Match':'0'}})).status,422);
 await assert.rejects(()=>ai.execute({action:'request',data:{code:'arbitrary'}}),/只支持日历/);
 await assert.rejects(()=>ai.request({method:'send',text:'你好'}),/API Key/);
});
