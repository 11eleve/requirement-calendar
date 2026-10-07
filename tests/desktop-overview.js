const calendar=document.querySelector('.rf-calendar');
if(!window.CalendarApp)throw new Error('App did not boot');
if(document.querySelector('.rf-week:last-child').getBoundingClientRect().bottom>innerHeight+1)throw new Error('Month does not fit');
await new Promise(requestAnimationFrame);
await Promise.allSettled(document.getAnimations().map(animation=>animation.finished));
return {month:document.querySelector('#rf-title').textContent,calendarHeight:calendar.getBoundingClientRect().height,viewport:[innerWidth,innerHeight]};
