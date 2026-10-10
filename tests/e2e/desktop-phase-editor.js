// Representative phase-editor screenshot using only isolated demonstration data.
const item={id:'phase-reading',title:'认证链路迁移与兼容验证',tone:'blue',start:'2026-12-28',end:'2027-02-15',phases:[{name:'方案评审',start:'2026-12-28',end:'2027-01-04'},{name:'开发与灰度兼容验证',start:'2027-01-08',end:'2027-02-03'},{name:'回归与验收',start:'2027-02-08',end:'2027-02-15'}],resources:[],tasks:[],done:[],note:''};
if(!await CalendarApp.restoreSnapshot(JSON.stringify({version:6,anchor:'2027-01-01',requirements:[item]})))throw Error('fixture restore failed');
CalendarApp.editRequirement(item.id);

document.querySelectorAll('[data-editor-panel=phases] details')[1].open=true;
document.getAnimations().forEach(animation=>animation.finish());await new Promise(resolve=>setTimeout(resolve,30));
document.getAnimations().forEach(animation=>animation.finish());document.querySelector('[data-editor-panel=phases]').scrollIntoView({block:'start'});document.activeElement?.blur();
const summaries=Array.from(document.querySelectorAll('.rf-phase-summary'));
if(summaries.some(row=>{const meta=row.querySelector('.rf-summary-meta');return meta.scrollWidth>meta.clientWidth+1;}))throw Error('phase date clipped');
return {viewport:[innerWidth,innerHeight],phases:summaries.map(row=>({name:row.querySelector('.rf-summary-name').textContent,period:row.querySelector('.rf-summary-meta').textContent})),scope:'actual isolated native WebKit phase-editor screenshot; completed animation endpoints'};
