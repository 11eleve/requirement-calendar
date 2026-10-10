// Isolated actual native startup: no user data or notification authorization.
const checks=[],assert=(v,m)=>{if(!v)throw Error(m);checks.push(m);};
const windowInfo=await webkit.messageHandlers.calendar.postMessage({action:'verifyWindow'});
assert(windowInfo.iconFile==='AppIcon.icns','bundle explicitly names the packaged ICNS icon');
assert(windowInfo.applicationIconAvailable,'running application exposes a valid application icon');
assert(!document.querySelector('#rf-storage-error')?.textContent.includes('已将旧版本机记录'),'normal startup has no migration success banner');
await CalendarApp.command('new');document.getAnimations().forEach(a=>a.finish());
assert(document.querySelector('.rf-duration')&&document.querySelectorAll('.rf-editor-section').length===4,'merged application retains the full continuous planning editor');
await CalendarApp.command('discard');
return {checks,scope:'Actual isolated macOS WebKit, packaged icon metadata and running NSApplication icon; synthetic new/discard commands.'};
