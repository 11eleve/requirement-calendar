// Keep native details/summary semantics while animating the real content box.
(() => {
  const controllers=new WeakMap(),motion=matchMedia('(prefers-reduced-motion:reduce)');
  let nextID=0;
  function create(disclosure,body,{onOpen=()=>{},allowMotion=()=>!motion.matches}={}) {
    const summary=disclosure.querySelector('summary');
    let desired=disclosure.open,nativeState=desired,animation=null;
    body.id='rf-disclosure-body-'+(++nextID);
    summary.setAttribute('aria-controls',body.id);
    summary.setAttribute('aria-expanded',String(desired));
    body.inert=!desired;
    const setNative=open=>{nativeState=open;disclosure.open=open;};
    function commit(){
      setNative(desired);body.inert=!desired;body.classList.remove('is-animating');
    }
    function setOpen(open,{animate=false}={}) {
      if(desired===open&&disclosure.open===open&&!animation)return;
      const wasOpen=disclosure.open,from=wasOpen?body.getBoundingClientRect().height:0,opacity=wasOpen?Number(getComputedStyle(body).opacity):0;
      if(animation){const old=animation;animation=null;old.cancel();}
      desired=open;summary.setAttribute('aria-expanded',String(open));
      if(!open&&body.contains(document.activeElement))summary.focus({preventScroll:true});
      body.inert=!open;
      if(open){setNative(true);onOpen();}
      if(!animate||!allowMotion()||!body.animate||!body.isConnected||(!open&&!wasOpen)){commit();return;}
      body.classList.add('is-animating');
      const to=open?body.getBoundingClientRect().height:0;
      if(Math.abs(from-to)<.5){commit();return;}
      try {
        const current=body.animate([{height:from+'px',opacity},{height:to+'px',opacity:open?1:0}],{duration:180,easing:'cubic-bezier(.22,.7,.25,1)',fill:'both'});
        animation=current;
        current.finished.then(()=>{if(animation!==current)return;animation=null;commit();current.cancel();},()=>{if(animation!==current)return;animation=null;commit();});
      } catch {commit();}
    }
    const click=event=>{if(event.defaultPrevented)return;event.preventDefault();summary.focus({preventScroll:true});setOpen(!desired,{animate:true});};
    const toggle=()=>{if(disclosure.open!==nativeState)setOpen(disclosure.open);};
    summary.addEventListener('click',click);disclosure.addEventListener('toggle',toggle);
    const controller={setOpen,finish(){animation?.finish();},dispose(){summary.removeEventListener('click',click);disclosure.removeEventListener('toggle',toggle);if(animation){const old=animation;animation=null;old.cancel();}body.classList.remove('is-animating');controllers.delete(disclosure);}};
    controllers.set(disclosure,controller);return controller;
  }
  motion.addEventListener('change',event=>{if(event.matches)document.querySelectorAll('.rf-disclosure').forEach(node=>controllers.get(node)?.finish());});
  window.CalendarDisclosure=Object.freeze({create,setOpen(node,open,options){const controller=controllers.get(node);if(controller)controller.setOpen(open,options);else node.open=open;},dispose(node){controllers.get(node)?.dispose();}});
})();
