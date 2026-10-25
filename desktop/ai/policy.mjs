import {timingSafeEqual} from 'node:crypto';

export const DEFAULTS = Object.freeze({
  baseURL:'https://api.deepseek.com/anthropic', model:'deepseek-flash', preferences:'',
  permissions:{read:true,create:false,update:false,delete:false}, apiEnabled:false,
});
export const RIGHTS = Object.freeze({status:'read',schema:'read',list:'read',get:'read',create:'create',update:'update',shift:'update',delete:'delete'});
export const WRITES = new Set(['create','update','shift','delete']);
export function failure(code,message) { return {ok:false,error:{code,message}}; }
export function assert(value,code,message) { if(!value)throw Object.assign(Error(message),{code}); }
export function settings(input={}) {
  assert(input&&typeof input==='object'&&!Array.isArray(input),'INVALID_ARGUMENT','设置格式无效。');
  const baseURL=new URL(input.baseURL??DEFAULTS.baseURL);
  assert((baseURL.protocol==='https:'||baseURL.protocol==='http:'&&['127.0.0.1','localhost','[::1]'].includes(baseURL.hostname))&&!baseURL.username&&!baseURL.password&&!baseURL.search&&!baseURL.hash,'INVALID_ARGUMENT','模型服务地址需要 HTTPS，本机测试服务可使用 HTTP。');
  const model=input.model??DEFAULTS.model,preferences=input.preferences??'';
  assert(typeof model==='string'&&/^[\w.\-/:]{1,120}$/.test(model),'INVALID_ARGUMENT','模型名称无效。');
  assert(typeof preferences==='string'&&preferences.length<=8000,'INVALID_ARGUMENT','工作习惯不能超过 8000 字。');
  const permissions={};
  for(const name of ['read','create','update','delete'])permissions[name]=input.permissions?.[name]??DEFAULTS.permissions[name];
  assert(Object.values(permissions).every(v=>typeof v==='boolean'),'INVALID_ARGUMENT','权限必须是开关。');
  assert(input.apiEnabled===undefined||typeof input.apiEnabled==='boolean','INVALID_ARGUMENT','API 开关无效。');
  return {baseURL:baseURL.href.replace(/\/$/,''),model,preferences,permissions,apiEnabled:input.apiEnabled??false};
}
export function authorized(token,expected) {
  if(typeof token!=='string'||typeof expected!=='string')return false;
  const a=Buffer.from(token),b=Buffer.from(expected);
  return a.length===b.length&&timingSafeEqual(a,b);
}
export function statusCode(result) {
  if(result.ok)return 200;
  const code=result.error?.code;
  return code==='UNAUTHORIZED'?401:code==='FORBIDDEN'?403:code==='NOT_FOUND'?404:
    ['DRAFT_DIRTY','BUSY','REVISION_CONFLICT','READ_FIRST'].includes(code)?409:
    ['APP_CLOSED','SAVE_FAILED','INTERNAL_ERROR'].includes(code)?503:422;
}
