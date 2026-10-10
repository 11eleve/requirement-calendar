'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const {randomUUID} = require('node:crypto');
const Model = require('../../src/domain/model.js');
const LIMIT = 16 * 1024 * 1024;
function decode(raw) {
  if (typeof raw !== 'string' || Buffer.byteLength(raw) > LIMIT) throw new Error('备份超过 16 MB 或格式无效。');
  return Model.snapshot(JSON.parse(raw));
}
function future(raw) {
  try { const value=JSON.parse(raw);return (value.privateContent??value).version>Model.VERSION; } catch { return false; }
}
class DataStore {
  constructor(directory) {
    this.directory=directory;this.file=path.join(directory,'calendar.json');
    this.backup=path.join(directory,'calendar.last-good.json');
    this.loaded=false;this.observed=null;this.blocked=false;this.tail=Promise.resolve();
  }
  serial(action) { const task=this.tail.then(action);this.tail=task.catch(()=>{});return task; }
  async read(file) {
    try { const stat=await fs.stat(file);if(stat.size>LIMIT)throw new Error('数据文件超过 16 MB，已阻止覆盖。');return await fs.readFile(file,'utf8'); }
    catch(error) { if(error.code==='ENOENT')return null;throw error; }
  }
  load() { return this.serial(async()=>{
    await fs.mkdir(this.directory,{recursive:true});
    const raw=await this.read(this.file);this.observed=raw;this.loaded=true;this.blocked=false;
    if(raw!==null) {
      try { decode(raw);return {raw,issue:null}; } catch {}
      if(future(raw)){this.blocked=true;return {raw:null,issue:'数据来自更高版本，已阻止覆盖。请升级应用。'};}
    }
    const backup=await this.read(this.backup);
    if(backup!==null) {
      try { decode(backup);return {raw:backup,issue:'已从上一次有效备份恢复；原始记录仍保留。'}; } catch {}
    }
    if(raw!==null||backup!==null){this.blocked=true;return {raw:null,issue:'本机记录无法读取，原始文件已保留。请从文件菜单恢复备份。'};}
    return {raw:null,issue:null};
  }); }
  async atomic(file,raw) {
    const temp=file+'.'+randomUUID()+'.tmp';let handle;
    try {
      handle=await fs.open(temp,'wx',0o600);await handle.writeFile(raw,'utf8');await handle.sync();await handle.close();handle=null;
      await fs.rename(temp,file);
    } finally { if(handle)await handle.close().catch(()=>{});await fs.unlink(temp).catch(()=>{}); }
  }
  save(raw,recovery=false) { return this.serial(async()=>{
    const data=decode(raw),normalized=JSON.stringify(data);
    if(!this.loaded)throw new Error('数据尚未载入，请重新打开应用。');
    if(this.blocked&&!recovery)throw new Error('本机记录无法安全覆盖，请先恢复备份。');
    const current=await this.read(this.file);
    if(current!==this.observed)throw new Error('数据文件已被其他程序修改。请先导出当前记录，再重新打开应用。');
    if(current!==null) {
      let valid=true;try{decode(current);}catch{valid=false;}
      if(recovery||!valid)await this.atomic(path.join(this.directory,'calendar.preserved-'+randomUUID()+'.json'),current);
      if(valid)await this.atomic(this.backup,current);
    }
    await this.atomic(this.file,normalized);this.observed=normalized;this.blocked=false;return data;
  }); }
}
module.exports={DataStore,decode,LIMIT};
