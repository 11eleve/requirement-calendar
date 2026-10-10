'use strict';
const {spawn} = require('node:child_process');
const {EventEmitter} = require('node:events');
const LIMIT = 64 * 1024 * 1024;
const failure = message => ({ok:false,error:{code:'INTERNAL_ERROR',message}});

// The native helper owns a current-user-only, local-only Windows named pipe.
// Only this inherited stdio channel can ask the host to dispatch a request.
class CommandBroker extends EventEmitter {
  constructor({executable, directory, dispatch, launch = spawn}) {
    super();
    this.options = {executable,directory,dispatch,launch};
    this.child = null;
  }
  async start() {
    if (this.child) throw Error('Command broker already started');
    const {executable,directory,dispatch,launch} = this.options;
    const child = launch(executable, ['--serve',directory], {stdio:['pipe','pipe','pipe'],windowsHide:true});
    this.child = child;
    let buffer = Buffer.alloc(0), ready = false, stopping = false, busy = false;
    this.stop = () => { stopping = true; child.stdin.end(); };
    return new Promise((resolve,reject) => {
      const timer = setTimeout(() => { child.kill(); reject(Error('Windows 命令行服务启动超时。')); },15000);
      const fail = error => {
        clearTimeout(timer);
        if (!ready) reject(error);
        else if (!stopping) this.emit('failure',error);
      };
      child.once('error',fail);
      child.once('exit',code => { this.child = null; fail(Error('Windows 命令行服务已退出：'+code)); });
      child.stderr.on('data',data => { this.emit('diagnostic',data.toString('utf8')); });
      child.stdin.on('error',fail);
      child.stdout.on('data',chunk => {
        buffer = Buffer.concat([buffer,chunk]);
        if (buffer.length > LIMIT) { child.kill(); fail(Error('命令行消息过大。')); return; }
        let newline;
        while ((newline = buffer.indexOf(10)) >= 0) {
          const raw = buffer.subarray(0,newline); buffer = buffer.subarray(newline+1);
          let message;
          try { message = JSON.parse(raw.toString('utf8')); }
          catch { child.kill(); fail(Error('命令行服务返回了无效消息。')); return; }
          if (!ready) {
            if (message.ready !== true || typeof message.pipe !== 'string') { child.kill(); fail(Error('命令行服务没有就绪。')); return; }
            ready = true; clearTimeout(timer); this.pipe = message.pipe; resolve(this); continue;
          }
          if (!Number.isSafeInteger(message.id) || !message.request || typeof message.request !== 'object' || Array.isArray(message.request) || busy) {
            child.kill(); fail(Error('命令行服务请求格式错误。')); return;
          }
          busy = true;
          void Promise.resolve().then(() => dispatch(message.request)).catch(error => failure(error.message)).then(response => {
            busy = false;
            if (!stopping && !child.stdin.destroyed) child.stdin.write(JSON.stringify({id:message.id,response})+'\n');
          });
        }
      });
    });
  }
  stop() { }
}
module.exports = {CommandBroker};
