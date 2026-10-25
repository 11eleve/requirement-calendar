import readline from 'node:readline';
import {CalendarAI} from './service.mjs';

const pending=new Map();let sequence=0;
const output=value=>process.stdout.write(JSON.stringify(value)+'\n');
const dispatch=request=>new Promise((resolve,reject)=>{
  const id=++sequence,timer=setTimeout(()=>{pending.delete(id);reject(Error('日历操作等待超时，请先查询数据再重试。'));},30000);
  pending.set(id,{resolve,reject,timer});output({type:'command',id,request});
});
const service=new CalendarAI({directory:process.argv[2],dispatch});
const lines=readline.createInterface({input:process.stdin,crlfDelay:Infinity});
let started;
lines.on('line',line=>{
  if(Buffer.byteLength(line)>2*1024*1024){console.error('AI host message exceeds limit');process.exit(1);}
  let message;try{message=JSON.parse(line);}catch{console.error('Invalid AI host JSON');process.exit(1);}
  if(message.type==='commandResult'){
    const waiter=pending.get(message.id);if(waiter){pending.delete(message.id);clearTimeout(waiter.timer);waiter.resolve(message.result);}return;
  }
  if(message.type==='request')void (async()=>{
    try{await started;output({type:'response',id:message.id,result:await service.request(message.request)});}
    catch(error){output({type:'response',id:message.id,error:{code:error.code??'AI_ERROR',message:service.redact(error.message)}});}
  })();
});
lines.on('close',()=>{void service.close().finally(()=>process.exit(0));});
process.on('SIGTERM',()=>{void service.close().finally(()=>process.exit(0));});
started=service.start();
try{await started;output({type:'ready'});}catch(error){console.error(service.redact(error.message));process.exit(1);}
