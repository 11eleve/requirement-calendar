// Observe actual rendering frames, rather than asserting a particular CSS duration.
const calendar=document.querySelector('#rf-calendar'),panel=document.querySelector('#rf-detail');
const reduced=matchMedia('(prefers-reduced-motion:reduce)').matches;
const next=()=>new Promise(requestAnimationFrame);
document.getAnimations().forEach(animation=>animation.finish());await next();
const initial=calendar.getBoundingClientRect().width;
document.querySelector('.rf-bar').click();
async function observe(){const frames=[],start=performance.now();while(performance.now()-start<340){await next();frames.push({ms:Math.round(performance.now()-start),width:calendar.getBoundingClientRect().width,opacity:Number(getComputedStyle(panel).opacity)});}return frames;}
const opening=await observe(),opened=calendar.getBoundingClientRect().width;
if(!(opened<initial))throw Error('The inspector did not open.');
if(!reduced&&!opening.some(frame=>frame.width>opened+1&&frame.width<initial-1))throw Error('No intermediate layout was observed during opening.');
if(opening.some((frame,i)=>i&&frame.width>opening[i-1].width+1))throw Error('Opening layout reversed direction.');
await CalendarApp.command('close');
const closing=await observe(),closed=calendar.getBoundingClientRect().width;
if(Math.abs(closed-initial)>1||!panel.hidden)throw Error('Closing did not restore the calendar.');
if(!reduced&&!closing.some(frame=>frame.width>opened+1&&frame.width<initial-1))throw Error('No intermediate layout was observed during closing.');
if(closing.some((frame,i)=>i&&frame.width<closing[i-1].width-1))throw Error('Closing layout reversed direction.');
if(reduced&&document.getAnimations().some(animation=>animation.playState==='running'))throw Error('Reduced motion left an animation running.');
return {initial,opened,closed,reducedMotion:reduced,opening,closing,discreteDisplayTransitionSupported:CSS.supports('transition-behavior','allow-discrete'),scope:'real WebKit frame geometry for opening and closing; does not prove trusted pointer feel or aesthetic preference'};
