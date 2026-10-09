// Long programmer-oriented content and long-range schedules in real WebKit.
const checks=[], $=s=>document.querySelector(s), $$=s=>Array.from(document.querySelectorAll(s));
const assert=(value,message)=>{if(!value)throw new Error(message);checks.push(message);};
// Static layout/focus checks complete animation endpoints; no display-frame measurement.
const settle=async()=>{document.getAnimations().forEach(a=>a.finish());await new Promise(resolve=>setTimeout(resolve,30));document.getAnimations().forEach(a=>a.finish());};
const title='跨年度认证服务升级 AuthenticationServiceMigration',phase='AuthenticationServiceMigrationAndCompatibilityValidation',task=phase+'AcrossAllClients';
const item={id:'content',title,start:'2026-12-20',end:'2027-02-10',phases:[{name:phase,start:'2026-12-20',end:'2027-02-10'}],resources:[{name:phase,type:'OpenAPICompatibilityAndAuthenticationContract',url:'https://example.com'}],tasks:[task],done:[false],note:'需要确认跨年期间的灰度与回滚安排。'};
const restore=async(value=item)=>{assert(await CalendarApp.restoreSnapshot(JSON.stringify({version:6,anchor:'2026-12-01',requirements:[value]})),'isolated long-content fixture restored');CalendarApp.openRequirement('content');await settle();$('#rf-close').blur();};
function checkLayout(){
 const elements=$$('.rf-detail-title,.rf-phase-row,.rf-phase-name,.rf-phase-period,.rf-task,.rf-resource-text,.rf-resource-text small,.rf-state');
 assert(elements.every(node=>node.scrollWidth<=node.clientWidth+1),'long titles, phases, resource types and tasks fit their own widths');
 assert($('.rf-phase-name').textContent===phase&&$('.rf-task span').textContent===task,'complete phase and task text stays present rather than truncated');
 assert($('.rf-phase-period').getBoundingClientRect().top>=$('.rf-phase-name').getBoundingClientRect().bottom-1&&$('.rf-phase-period').getBoundingClientRect().height<20,'long date ranges move below the full-width phase name instead of squeezing it');
 assert($('.rf-phase-period').getBoundingClientRect().right<=$('.rf-section').getBoundingClientRect().right-10,'phase dates stay within the timeline section');
}
async function checkEditorLayout(){
 const original=CalendarApp.exportSnapshot();CalendarApp.editRequirement('content');await settle();
 const resourceMeta=$('[data-editor-panel=resources] .rf-summary-meta');
 assert(resourceMeta.title===item.resources[0].type+' · example.com','custom resource types and source retain a complete summary tooltip');
 await settle();
 const summary=$('.rf-phase-summary'),name=summary.querySelector('.rf-summary-name'),period=summary.querySelector('.rf-summary-meta'),remove=summary.closest('.rf-editor-item').querySelector('.rf-remove');
 assert(name.textContent===phase&&name.scrollWidth<=name.clientWidth+1&&name.scrollHeight<=name.clientHeight+1,'the collapsed editor wraps the complete long phase name without clipping');
 assert(period.textContent==='2026.12.20—2027.2.10 · 共 53 天'&&period.scrollWidth<=period.clientWidth+1&&period.title===period.textContent,'cross-year editor dates remain completely visible and available on hover');
 assert(period.getBoundingClientRect().top>=name.getBoundingClientRect().bottom-1&&Math.max(name.getBoundingClientRect().right,period.getBoundingClientRect().right)<=remove.getBoundingClientRect().left-3,'the full date sits beneath the phase name without entering the removal target');
 assert(!CalendarApp.hasUnsavedChanges()&&!!$('.rf-range-preview.is-visible')&&CalendarApp.exportSnapshot()===original,'reading collapsed phase summaries retains a clean draft and its range strip');
 $$('.rf-form-actions button').find(node=>node.textContent==='取消').click();await settle();
}
await restore();
assert($('.rf-period').textContent==='2026.12.20 — 2027.2.10','cross-year requirement periods show both years');
assert($('.rf-phase-period').textContent==='2026.12.20—2027.2.10','cross-year phase periods show both years');
assert($$('.rf-bar').every(node=>node.title.includes('2026.12.20—2027.2.10')),'cross-week bars retain the complete period on hover');
checkLayout();
await checkEditorLayout();
await webkit.messageHandlers.calendar.postMessage({action:'verifyWindow',save:true});await settle();checkLayout();await checkEditorLayout();
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
