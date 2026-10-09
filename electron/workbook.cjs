'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),{randomUUID}=require('node:crypto');
function workbookBytes(value){
 if(!value||typeof value.name!=='string'||path.basename(value.name)!==value.name||!value.name.endsWith('.xlsx')||typeof value.base64!=='string'||value.base64.length%4!==0||/[^A-Za-z0-9+/=]/.test(value.base64))throw Error('Excel 导出数据无效。');
 const bytes=Buffer.from(value.base64,'base64');if(bytes.toString('base64')!==value.base64)throw Error('Excel 编码无效。');if(bytes.length<22||!bytes.subarray(0,4).equals(Buffer.from([0x50,0x4b,3,4])))throw Error('Excel 文件格式无效。');return bytes;
}
async function writeWorkbook(target,bytes){
 const temporary=path.join(path.dirname(target),'.calendar-export-'+randomUUID()+'.tmp');
 try{await fs.writeFile(temporary,bytes,{flag:'wx'});await fs.rename(temporary,target);}finally{await fs.rm(temporary,{force:true}).catch(()=>{});}
}
module.exports={workbookBytes,writeWorkbook};
