// Representative resource-editor screenshot using isolated demonstration data.
const item={id:'resource-editor',title:'认证服务迁移与灰度发布',tone:'blue',start:'2026-10-09',end:'2026-11-08',phases:[{name:'评审',start:'2026-10-09',end:'2026-10-10'},{name:'开发',start:'2026-10-11',end:'2026-10-31'},{name:'灰度验证',start:'2026-11-01',end:'2026-11-08'}],resources:[{name:'认证服务接口约定与兼容验证记录',type:'接口约定',url:'https://example.com/auth'},{name:'灰度发布方案与回滚条件',type:'评审文档',url:''}],tasks:['确认旧版客户端兼容范围','记录灰度监控与回滚阈值'],done:[true,false],note:'发布前确认错误率与重试监控。'};
if(!await CalendarApp.restoreSnapshot(JSON.stringify({version:6,anchor:'2026-10-01',requirements:[item]})))throw Error('fixture restore failed');
CalendarApp.editRequirement(item.id);
document.querySelector('.rf-resource-summary').click();
document.getAnimations().forEach(a=>a.finish());await new Promise(resolve=>setTimeout(resolve,30));document.getAnimations().forEach(a=>a.finish());
document.querySelector('[data-editor-panel=resources]').scrollIntoView({block:'start'});
document.activeElement?.blur();
const rows=Array.from(document.querySelectorAll('.rf-resource-summary'));
if(rows.some(row=>Array.from(row.querySelectorAll('.rf-summary-name,.rf-summary-meta')).some(node=>node.scrollWidth>node.clientWidth+1||node.scrollHeight>node.clientHeight+1)))throw Error('resource summary clipped');
return {viewport:[innerWidth,innerHeight],resources:rows.map(row=>({name:row.querySelector('.rf-summary-name').textContent,type:row.querySelector('.rf-summary-meta').textContent})),scope:'actual isolated native WebKit resource-editor screenshot, synthetic summary activation and completed animation endpoints'};
