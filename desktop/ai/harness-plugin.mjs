// Calendar tools for the official DeepSeek Harness (MIT).
// Registry integration follows deepseek-ai/deepseek-harness's defineTool API.
import {defineTool} from '@deepseek-ai/dsh-tools';
import {createHash} from 'node:crypto';

export const name='requirement-calendar-tools';
export const inject=['tools'];
const text=(description,required=false)=>({type:'string',description,...required?{required:true}:{}});
const data={type:'object',additionalProperties:true,required:true,description:'需求字段。先调用 calendar_schema 查看结构；update 仅提供要修改的字段，数组字段提供完整数组。'};
const definitions=[
  ['context','读取今天、时区、当前月份、用户工作习惯与已授予权限。',{}],
  ['status','读取当前日历 revision 和需求数量。',{}],
  ['schema','读取需求字段、日期格式与 JSON Schema。',{}],
  ['list','查询已保存的需求，返回概要。时间范围为有交集的需求。',{from:text('起始日期 YYYY-MM-DD'),to:text('结束日期 YYYY-MM-DD'),query:text('搜索词')}],
  ['get','按准确 ID 读取已保存的需求详情。',{id:text('需求 ID',true)}],
  ['create','创建用户明确要求的新需求，成功后立即保存并刷新日历。',{data}],
  ['update','修改用户指定的需求；先查询以确认 ID，保留未指定字段。',{id:text('需求 ID',true),data}],
  ['shift','将需求起止日期、阶段、节点整体平移指定天数。',{id:text('需求 ID',true),days:{type:'integer',description:'平移天数，可为负数',required:true}}],
  ['delete','删除用户明确指定的需求。没有明确目标时先询问，不猜测。',{id:text('准确的需求 ID',true)}],
];
export function apply(ctx,config) {
  const toolNames=definitions.map(([action])=>'calendar_'+action);
  for(const [action,description,parameters] of definitions){
    ctx.effect(()=>ctx.tools.register(defineTool({
      name:'calendar_'+action,description,parameters,
      output:{schema:{type:'string'},render:(_args,value)=>[{type:'text',text:value}]},
      async execute(args,exec) {
        const command={action};for(const key of Object.keys(parameters))if(args[key]!==undefined)command[key]=args[key];
        if(action==='create'&&!command.data.id)command.data={...command.data,id:'ai-'+createHash('sha256').update(String(exec.callId)).digest('hex').slice(0,24)};
        const context=action==='context';
        const response=await fetch(config.endpoint+(context?'/internal/context':'/internal/command'),{
          method:context?'GET':'POST',headers:{Authorization:'Bearer '+config.token,'Content-Type':'application/json'},
          ...context?{}:{body:JSON.stringify(command)},signal:exec.signal,
        });
        const result=await response.json();
        if(action==='list'&&result.ok&&Array.isArray(result.data)){
          result.total=result.data.length;result.data=result.data.slice(0,200).map(({id,title,start,end,short,tone})=>({id,title,start,end,short,tone}));
          if(result.total>200)result.hint='结果超过 200 条，请缩小日期范围或使用搜索词。详情通过 calendar_get 获取。';
        }
        return JSON.stringify(result);
      },
    })));
  }
  // The profile disables built-in file/shell tools; this independent admission
  // restriction also prevents an upstream default from exposing a new tool.
  ctx.on('agent/created',({agent})=>{agent.ctx.effect(()=>agent.ctx.tools.restrict({allow:toolNames}));});
}
