// Actual screenshot fixture for a multiline note, independent of user data.
const snapshot=JSON.parse(CalendarApp.exportSnapshot()),item=snapshot.requirements.find(r=>r.id==='checkout');
item.note='评审结论\n    保留旧接口，灰度期间同时支持两种响应。\n接口约定\n    retryable: true 时允许再次发起请求。\n发布安排\n    先验证监控，再逐步扩大流量。\n回滚条件\n    错误率超过阈值时切回旧实现。';
if(!await CalendarApp.restoreSnapshot(JSON.stringify(snapshot)))throw Error('fixture restore failed');
CalendarApp.editRequirement(item.id);document.getAnimations().forEach(a=>a.finish());
await new Promise(resolve=>setTimeout(resolve,30));document.getAnimations().forEach(a=>a.finish());
const note=document.querySelector('textarea');note.focus();note.dispatchEvent(new Event('input',{bubbles:true}));
await new Promise(resolve=>setTimeout(resolve,30));document.getAnimations().forEach(a=>a.finish());
const bounds=note.getBoundingClientRect(),footerTop=document.querySelector('.rf-form-actions').getBoundingClientRect().top;
if(bounds.bottom>footerTop+1)throw Error('The saved action area covers the note fixture');
document.activeElement?.blur();
return {height:bounds.height,bottom:bounds.bottom,footerTop,clientHeight:note.clientHeight,scrollHeight:note.scrollHeight,noteUnchanged:note.value===item.note,scope:'actual isolated native WebKit multiline-note screenshot; synthetic focus/input and completed animation endpoints'};
