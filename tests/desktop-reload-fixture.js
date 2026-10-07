const saved=JSON.parse(CalendarApp.exportSnapshot()),item=saved.requirements.find(x=>x.id==='restart-proof');
if(!item||item.title!=='跨进程保存验证'||item.note!=='重新启动后应保持\n完整内容'||item.done[0]!==true||saved.anchor!=='2027-01-10')throw new Error('process restart lost content');
if(!document.querySelector('#rf-storage-error').hidden)throw new Error('clean restart reported an unexpected storage issue');
return {reloaded:saved};
