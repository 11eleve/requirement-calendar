// Long programmer-oriented content and long-range schedules in real WebKit.
const checks=[], $=s=>document.querySelector(s), $$=s=>Array.from(document.querySelectorAll(s));
const assert=(value,message)=>{if(!value)throw new Error(message);checks.push(message);};
const settle=async()=>{document.getAnimations().forEach(a=>a.finish());await new Promise(requestAnimationFrame);document.getAnimations().forEach(a=>a.finish());};
const title='跨年度认证服务升级 AuthenticationServiceMigration',phase='AuthenticationServiceMigrationAndCompatibilityValidation',task=phase+'AcrossAllClients';
const item={id:'content',title,start:'2026-12-20',end:'2027-02-10',phases:[{name:phase,start:'2026-12-20',end:'2027-02-10'}],resources:[{name:phase,type:'OpenAPICompatibilityAndAuthenticationContract',url:'https://example.com'}],tasks:[task],done:[false],note:'需要确认跨年期间的灰度与回滚安排。'};
const restore=async(value=item)=>{assert(await CalendarApp.restoreSnapshot(JSON.stringify({version:6,anchor:'2026-12-01',requirements:[value]})),'isolated long-content fixture restored');CalendarApp.openRequirement('content');await settle();$('#rf-close').blur();};
function checkLayout(){
 const elements=$$('.rf-detail-title,.rf-phase-row,.rf-phase-name,.rf-phase-period,.rf-task,.rf-resource-text,.rf-resource-text small,.rf-state');
 assert(elements.every(node=>node.scrollWidth<=node.clientWidth+1),'long titles, phases, resource types and tasks fit their own widths');
 assert($('.rf-phase-name').textContent===phase&&$('.rf-task span').textContent===task,'complete phase and task text stays present rather than truncated');
 assert($('.rf-phase-period').getBoundingClientRect().top>=$('.rf-phase-name').getBoundingClientRect().bottom-1&&$('.rf-phase-period').getBoundingClientRect().height<20,'long date ranges move below the full-width phase name instead of squeezing it');
 assert($('.rf-phase-period').getBoundingClientRect().right<=$('.rf-section').getBoundingClientRect().right-10,'phase dates stay within the timeline card');
}
await restore();
assert($('.rf-period').textContent==='2026.12.20 — 2027.2.10','cross-year requirement periods show both years');
assert($('.rf-phase-period').textContent==='2026.12.20—2027.2.10','cross-year phase periods show both years');
assert($$('.rf-bar').every(node=>node.title.includes('2026.12.20—2027.2.10')),'cross-week bars retain the complete period on hover');
checkLayout();
await webkit.messageHandlers.calendar.postMessage({action:'verifyWindow',save:true});await settle();checkLayout();
const multiYear={...item,start:'2025-12-01',end:'2027-02-10',phases:[{name:phase,start:'2026-12-01',end:'2026-12-31'}]};
await CalendarApp.command('close');await restore(multiYear);
assert($('.rf-phase-period').textContent==='2026.12.1—2026.12.31','phases outside the visible year retain their year context');
await CalendarApp.command('close');await restore({...item,end:'2026-12-31',phases:[{name:phase,start:'2026-12-20',end:'2026-12-31'}]});
assert($('.rf-period').textContent==='12.20 — 12.31'&&$('.rf-phase-period').textContent==='12.20—12.31','same-year content retains compact date labels');
await CalendarApp.command('close');
const today=CalendarModel.localDate();await restore({...item,start:today,end:today,phases:[{name:phase,start:today,end:today}]});
assert($('.rf-state').textContent===phase&&$('.rf-state').scrollWidth<=$('.rf-state').clientWidth+1,'long current-stage status wraps within the metadata area');
await CalendarApp.command('close');await restore();
return {checks,appearance:matchMedia('(prefers-color-scheme:dark)').matches?'dark':'light',viewport:[innerWidth,innerHeight],scope:'actual WebKit geometry at default and smaller native window; synthetic actions with isolated data'};
