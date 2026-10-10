const $=s=>document.querySelector(s);
const titles=['认证链路重构','结算流程改版','报表导出优化','文件预览改造','权限策略调整','消息中心迭代','搜索接口提速','缓存一致性修复','CI 构建优化','错误监控接入','计费规则更新','批量导入支持','审计日志补齐','支付回调回归'];
const requirements=titles.map((title,i)=>({id:'dense-'+String(i).padStart(2,'0'),title,tone:['','blue','green'][i%3],start:'2026-10-01',end:'2026-10-31',phases:[{name:'需求评审',start:'2026-10-01',end:'2026-10-03'},{name:'开发与联调',start:'2026-10-05',end:'2026-10-23'},{name:'测试验收',start:'2026-10-26',end:'2026-10-31'}],resources:[],tasks:[],done:[],note:''}));

if(!await CalendarApp.restoreSnapshot(JSON.stringify({version:6,anchor:'2026-10-01',requirements})))throw Error('fixture restore failed');
document.getAnimations().forEach(a=>a.finish());const calendar=$('#rf-calendar'),week=document.querySelectorAll('.rf-week')[1];calendar.scrollTop+=week.getBoundingClientRect().top-$('.rf-weekdays').getBoundingClientRect().bottom+260;
return {requirements:requirements.length,visibleWeekStart:week.querySelector('.rf-date').dataset.date,dates:Array.from(week.querySelectorAll('.rf-date-number'),node=>node.textContent),dateHeaderTop:week.querySelector('.rf-date-label').getBoundingClientRect().top,weekdayBottom:$('.rf-weekdays').getBoundingClientRect().bottom,viewport:[innerWidth,innerHeight],scope:'actual isolated native WebKit dense-schedule screenshot; completed animation endpoints'};
