document.querySelector('.rf-bar').click();
Array.from(document.querySelectorAll('button')).find(x=>x.textContent==='编辑需求').click();
if(!document.querySelector('.rf-range-preview.is-visible'))throw new Error('Editing range is missing');
const panel=document.querySelector('#rf-panel');
if(getComputedStyle(panel).overflowY!=='auto')throw new Error('Editor must scroll internally');
await new Promise(requestAnimationFrame);
await Promise.allSettled(document.getAnimations().map(animation=>animation.finished));
if(Number(getComputedStyle(document.querySelector('.rf-range-preview.is-visible')).opacity)<.39)throw new Error('Editing range must be visible after motion completes');
return {editing:document.querySelector('.rf-form input[type=text]').value,scrollHeight:panel.scrollHeight,visibleHeight:panel.clientHeight};
