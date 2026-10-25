'use strict';
const {spawn}=require('node:child_process');
const fs=require('node:fs/promises');
const path=require('node:path');
const {randomUUID}=require('node:crypto');

class AIClient {
  constructor({entry,directory,dispatch,vault,executable=process.execPath}) {
    Object.assign(this,{entry,directory,dispatch,vault,executable});this.pending=new Map();this.sequence=0;this.child=null;
  }
  start() {
    if(this.starting)return this.starting;
    this.starting=(async()=>{
      await fs.mkdir(this.directory,{recursive:true,mode:0o700});
      const child=spawn(this.executable,[this.entry,this.directory],{stdio:['pipe','pipe','pipe'],windowsHide:true,env:{...process.env,ELECTRON_RUN_AS_NODE:'1'}});this.child=child;
      await new Promise((resolve,reject)=>{
        let buffer=Buffer.alloc(0),ready=false;
        const timer=setTimeout(()=>{child.kill();reject(Error('日历助手启动超时。'));},15000);
        const fail=error=>{clearTimeout(timer);if(!ready)reject(error);for(const waiter of this.pending.values()){clearTimeout(waiter.timer);waiter.reject(error);}this.pending.clear();};
        child.on('error',fail);child.stdin.on('error',fail);
        child.on('exit',()=>{this.child=null;fail(Error('日历助手服务已退出，请重新打开应用。'));});
        // Runtime diagnostics must not become renderer state or log credentials.
        child.stderr.on('data',()=>{});
        child.stdout.on('data',chunk=>{
          buffer=Buffer.concat([buffer,chunk]);if(buffer.length>4*1024*1024){child.kill();fail(Error('助手消息过大。'));return;}
          let end;while((end=buffer.indexOf(10))>=0){
            const raw=buffer.subarray(0,end);buffer=buffer.subarray(end+1);let message;
            try{message=JSON.parse(raw.toString('utf8'));}catch{child.kill();fail(Error('助手通信格式无效。'));return;}
            if(message.type==='ready'){ready=true;clearTimeout(timer);resolve();}
            else if(message.type==='response'){
              const waiter=this.pending.get(message.id);if(!waiter)continue;this.pending.delete(message.id);clearTimeout(waiter.timer);
              if(message.error)waiter.reject(Object.assign(Error(message.error.message),{code:message.error.code}));else waiter.resolve(message.result);
            }else if(message.type==='command'){
              void Promise.resolve().then(()=>this.dispatch(message.request)).catch(()=>({ok:false,error:{code:'APP_CLOSED',message:'日历尚未就绪。'}})).then(result=>{if(!child.stdin.destroyed)child.stdin.write(JSON.stringify({type:'commandResult',id:message.id,result})+'\n');});
            }
          }
        });
      });
      let secret='',issue;try{secret=await this.readKey();}catch(error){issue=error.message;}
      await this.send({method:'key',value:secret,issue});
    })();return this.starting;
  }
  send(request) {
    return new Promise((resolve,reject)=>{
      const id=++this.sequence,timer=setTimeout(()=>{this.pending.delete(id);reject(Error('助手请求超时，请稍后重试。'));},20000);
      this.pending.set(id,{resolve,reject,timer});
      this.child.stdin.write(JSON.stringify({type:'request',id,request})+'\n');
    });
  }
  async request(request) {
    await this.start();
    if(!request||!['state','configure','new','select','send','cancel','rotateToken'].includes(request.method))throw Error('不支持的助手操作。');
    if(request.method==='configure'){
      const state=await this.send({method:'state'});
      if(state.busy&&('apiKey' in request||request.clearKey))throw Error('请先停止对话再更换 API Key。');
      await this.send({method:'configure',settings:request.settings});
      if(request.apiKey||request.clearKey){
        const key=request.clearKey?'':request.apiKey;
        if(typeof key!=='string'||key.length>4096)throw Error('API Key 无效。');
        await this.writeKey(key);await this.send({method:'key',value:key});
      }
      return this.send({method:'state'});
    }
    return this.send(request);
  }
  async readKey() {
    try{return this.vault.decrypt(await fs.readFile(path.join(this.directory,'key.enc')));}
    catch(error){if(error.code==='ENOENT')return '';throw Error('无法读取已保存的 API Key，请在助手设置中重新保存。');}
  }
  async writeKey(key) {
    const target=path.join(this.directory,'key.enc');
    if(!key){await fs.unlink(target).catch(error=>{if(error.code!=='ENOENT')throw error;});return;}
    const temporary=target+'.'+randomUUID()+'.tmp';
    try{await fs.writeFile(temporary,this.vault.encrypt(key),{mode:0o600,flag:'wx'});await fs.rename(temporary,target);}
    finally{await fs.unlink(temporary).catch(()=>{});}
  }
  stop(){this.child?.stdin.end();}
}
module.exports={AIClient};
