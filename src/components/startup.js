/* Decorative only: never gates loading, steals focus or delays an input. */
window.CalendarStartup=(()=>{
 const played=new WeakSet();
 function play(root){
  if(!root||played.has(root))return null;
  played.add(root);
  const motion=matchMedia('(prefers-reduced-motion:reduce)');
  if(motion.matches||document.visibilityState==='hidden'||typeof Element.prototype.animate!=='function')return null;
  const overlay=document.createElement('div');overlay.className='rf-startup';overlay.setAttribute('aria-hidden','true');
  const calendar=document.createElement('div');calendar.className='rf-startup-calendar';
  const header=document.createElement('div');header.className='rf-startup-header';calendar.append(header);
  const sheet=front=>{const page=document.createElement('div');page.className='rf-startup-sheet'+(front?' is-front':'');for(let i=0;i<15;i++){const pixel=document.createElement('i');pixel.className='rf-startup-pixel';page.append(pixel);}calendar.append(page);return page;};
  sheet(false);const front=sheet(true);overlay.append(calendar);root.append(overlay);
  let done=false,timer,resolve;const animations=[];
  const finished=new Promise(r=>{resolve=r;});
  const cancel=()=>{
   if(done)return;done=true;clearTimeout(timer);
   window.removeEventListener('pointerdown',cancel,true);window.removeEventListener('keydown',cancel,true);window.removeEventListener('pagehide',cancel);
   document.removeEventListener('visibilitychange',visibility);motion.removeEventListener('change',preference);
   animations.forEach(animation=>animation.cancel());overlay.remove();resolve();
  };
  const visibility=()=>{if(document.visibilityState==='hidden')cancel();};
  const preference=()=>{if(motion.matches)cancel();};
  window.addEventListener('pointerdown',cancel,true);window.addEventListener('keydown',cancel,true);window.addEventListener('pagehide',cancel);
  document.addEventListener('visibilitychange',visibility);motion.addEventListener('change',preference);
  const start=(element,frames,options)=>{const animation=element.animate(frames,options);animation.finished.catch(()=>{});animations.push(animation);return animation;};
  try {
   start(calendar,[{transform:'translateY(5px)',opacity:0},{transform:'none',opacity:1}],{duration:150,easing:'ease-out',fill:'both'});
   start(front,[{transform:'rotateX(0deg)',opacity:1},{transform:'rotateX(-105deg)',opacity:0}],{delay:140,duration:420,easing:'cubic-bezier(.3,.1,.2,1)',fill:'both'});
   const fade=start(overlay,[{opacity:1},{opacity:0}],{delay:540,duration:200,easing:'ease-out',fill:'both'});
   fade.finished.then(cancel,cancel);
   // Background windows may throttle rendering; never leave a stale cover.
   timer=setTimeout(cancel,1000);
  } catch {cancel();}
  return {finished,cancel};
 }
 return {play};
})();
CalendarStartup.play(document.getElementById('req-calendar-refined'));
