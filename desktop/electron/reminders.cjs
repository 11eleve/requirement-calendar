'use strict';
const {createHash}=require('node:crypto');
const {spawn}=require('node:child_process');
const path=require('node:path');
const {requirementURL}=require('./policy.cjs');
const APP_ID='dev.11eleve.requirement-calendar';
const TOAST_CLSID='0CB9CF52-7625-4AFB-A339-3D1B3F5D6DB2';
function plans(snapshot,now=Date.now()) {
  return snapshot.requirements.filter(item=>item.reminder&&new Date(item.reminder).getTime()>now).map(item=>({
    id:'rc'+createHash('sha256').update(item.id).digest('hex').slice(0,14),
    title:item.title,due:new Date(item.reminder).toISOString(),url:requirementURL(item.id)
  }));
}
function execute(script,input) {
  return new Promise((resolve,reject)=>{
    const child=spawn(path.join(process.env.SystemRoot||'C:\\Windows','System32','WindowsPowerShell','v1.0','powershell.exe'),
      ['-NoLogo','-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',script],{windowsHide:true,stdio:['pipe','pipe','pipe']});
    let output='',errorOutput='',ended=false;
    const timer=setTimeout(()=>{child.kill();finish(new Error('系统提醒响应超时。'));},15000);
    function finish(error,value){if(ended)return;ended=true;clearTimeout(timer);error?reject(error):resolve(value);}
    child.on('error',error=>finish(error));child.stdin.on('error',()=>{});
    child.stdout.on('data',part=>{output+=part.toString();if(output.length>65536){child.kill();finish(new Error('系统提醒响应异常。'));}});
    child.stderr.on('data',part=>{if(errorOutput.length<8192)errorOutput+=part.toString();});
    child.on('close',code=>{
      try { const result=JSON.parse(output.replace(/^\uFEFF/,''));if(result.ok!==true||code!==0)throw new Error(result.issue||'系统提醒不可用。');finish(null,result); }
      catch(error){finish(error);}
    });
    child.stdin.end(JSON.stringify(input));
  });
}
class Reminders {
  constructor({script,enabled,run=execute,onIssue=()=>{}}) {this.script=script;this.enabled=enabled;this.run=run;this.onIssue=onIssue;this.tail=Promise.resolve();this.revision=0;}
  reconcile(snapshot) {
    const desired=plans(snapshot),revision=++this.revision;
    const task=this.tail.then(async()=>{
      if(revision!==this.revision)return;
      let issue=null;
      try {
        if(!this.enabled){if(desired.length)issue='需求已保存。系统定时提醒需要安装后的 Windows 桌面版。';}
        else await this.run(this.script,{appId:APP_ID,plans:desired});
      } catch(error){issue='需求已保存；'+error.message;}
      if(revision===this.revision)this.onIssue(issue);
      return issue;
    });
    this.tail=task.catch(()=>{});return task;
  }
}
module.exports={APP_ID,TOAST_CLSID,plans,execute,Reminders};
