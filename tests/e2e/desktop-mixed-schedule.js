// Representative native screenshot of short work alongside a longer phased plan.
const item=(id,title,tone,start,end,phases=[])=>({id,title,tone,start,end,phases,resources:[],tasks:[],done:[],note:''});
const requirements=[item('long','认证链路重构','blue','2026-10-01','2026-10-31',[{name:'需求评审',start:'2026-10-01',end:'2026-10-03'},{name:'开发与联调',start:'2026-10-05',end:'2026-10-23'},{name:'测试验收',start:'2026-10-26',end:'2026-10-31'}]),item('export','导出任务修复','','2026-10-01','2026-10-03'),item('api','接口字段对齐','green','2026-10-01','2026-10-03'),item('login','登录边界回归','','2026-10-01','2026-10-03')];
if(!await CalendarApp.restoreSnapshot(JSON.stringify({version:6,anchor:'2026-10-01',requirements})))throw Error('fixture restore failed');
document.getAnimations().forEach(animation=>animation.finish());
const calendar=document.querySelector('#rf-calendar');
if(calendar.scrollHeight>calendar.clientHeight+1)throw Error('The compacted mixed schedule does not fit the default window.');
return {requirements:4,month:document.querySelector('#rf-title').textContent,viewport:[innerWidth,innerHeight],calendarHeight:calendar.clientHeight,scrollHeight:calendar.scrollHeight,scope:'actual isolated native WebKit screenshot; completed animation endpoints'};
