import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import Commands from '../../src/domain/commands.js';
import {CalendarAI} from '../../desktop/ai/service.mjs';

// Real Harness + real plugin + real command rules. Only the paid model transport
// is simulated, using the official Messages streaming wire protocol.
function stream(content,reason) {
  return [
    {type:'message_start',message:{id:'calendar-test',model:'deepseek-flash',usage:{input_tokens:10,output_tokens:0}}},
    {type:'content_block_start',index:0,content_block:content},{type:'content_block_stop',index:0},
    {type:'message_delta',delta:{stop_reason:reason},usage:{output_tokens:10}},{type:'message_stop'},
  ].map(event=>'event: '+event.type+'\ndata: '+JSON.stringify(event)+'\n\n').join('');
}
test('official DeepSeek Harness executes calendar tools and persists protected CRUD results',{timeout:90000},async t=>{
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'calendar-harness-'));
  let snapshot={version:7,anchor:'2026-10-26',requirements:[]},revision=0;
  const commands=[],requests=[],outputs=[];
  const operations=[['context',{}],['schema',{}],['list',{}],
    ['create',{data:{id:'harness-check',title:'助手创建的需求',start:'2026-10-26',end:'2026-10-30'}}],
    ['update',{id:'harness-check',data:{note:'已确认接口'}}],['shift',{id:'harness-check',days:2}],['get',{id:'harness-check'}],['delete',{id:'harness-check'}]];
  const model=http.createServer(async(req,res)=>{
    let body='';for await(const chunk of req)body+=chunk;
    const request=JSON.parse(body);requests.push(request);
    const op=operations[requests.length-1];
    res.writeHead(200,{'Content-Type':'text/event-stream'});
    res.end(op?stream({type:'tool_use',id:'call-'+requests.length,name:'calendar_'+op[0],input:op[1]},'tool_use'):stream({type:'text',text:'已完成创建、修改、平移和删除，日历已经保存。'},'end_turn'));
  });
  await new Promise(resolve=>model.listen(0,'127.0.0.1',resolve));
  const ai=new CalendarAI({directory:path.join(directory,'assistant'),dispatch:async request=>{
    commands.push(request);
    if(request.expectedRevision!==undefined&&request.expectedRevision!=='revision-'+revision)return {ok:false,error:{code:'REVISION_CONFLICT',message:'已变化'}};
    try{const result=Commands.plan(snapshot,request);if(result.changed){snapshot=result.snapshot;revision++;await fs.writeFile(path.join(directory,'calendar.json'),JSON.stringify(snapshot));}
      const output={ok:true,revision:'revision-'+revision,data:result.data,changed:result.changed};outputs.push(output);return output;
    }catch(error){return {ok:false,error:{code:error.code??'VALIDATION_FAILED',message:error.message}};}
  }});
  t.after(async()=>{await ai.close();await new Promise(resolve=>model.close(resolve));await fs.rm(directory,{recursive:true,force:true});});
  await ai.start();await ai.request({method:'key',value:'fixture-key-not-a-real-credential'});
  await ai.request({method:'configure',settings:{baseURL:'http://127.0.0.1:'+model.address().port,model:'deepseek-flash',preferences:'周五预留给验收',permissions:{read:true,create:true,update:true,delete:true}}});
  await ai.request({method:'send',text:'创建需求，更新备注，平移两天，最后删除测试需求。',context:{timezone:'Asia/Shanghai',anchor:'2026-10-26'}});
  await ai.running;
  assert.equal(ai.problem,null,JSON.stringify(ai.state()));
  assert.match(ai.state().messages.find(m=>m.role==='assistant').content,/已完成/);
  assert.deepEqual(commands.filter(c=>['create','update','shift','delete'].includes(c.action)).map(c=>c.action),['create','update','shift','delete']);
  assert.equal(outputs.find(o=>o.data?.note==='已确认接口').data.id,'harness-check');
  assert.equal(outputs.find(o=>o.data?.start==='2026-10-28').data.end,'2026-11-01');
  assert.equal(JSON.parse(await fs.readFile(path.join(directory,'calendar.json'),'utf8')).requirements.length,0);
  for(const request of requests){assert.ok(request.tools.length>=8);assert.ok(request.tools.every(tool=>tool.name.startsWith('calendar_')),JSON.stringify(request.tools.map(t=>t.name)));}
  const history=await fs.readFile(path.join(directory,'assistant/conversations.json'),'utf8');
  const config=await fs.readFile(path.join(directory,'assistant/settings.json'),'utf8');
  assert.ok(!history.includes('fixture-key')&&!config.includes('fixture-key'));
  assert.equal(ai.state().messages.filter(m=>m.role==='tool'&&m.ok).length,7);
});
