// Screenshot fixture for the actual inspector, without an artificial keyboard focus ring.
document.querySelector('.rf-bar').click();
document.getAnimations().forEach(animation=>animation.finish());
document.querySelector('#rf-close').blur();
const panel=document.querySelector('#rf-panel');
if(!panel.querySelector('h2')||!panel.querySelector('.rf-resource-row')||!panel.querySelector('.rf-task'))throw Error('The representative detail content is missing.');
return {title:panel.querySelector('h2').textContent,resources:panel.querySelectorAll('.rf-resource-row').length,tasks:panel.querySelectorAll('.rf-task').length,viewport:[innerWidth,innerHeight]};
