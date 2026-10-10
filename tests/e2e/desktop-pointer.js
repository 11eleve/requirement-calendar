// Exercise the real WebKit event handlers and hit testing. Only pointer capture
// bookkeeping is stubbed: synthetic events do not own a trusted OS pointer.
const checks=[],$=selector=>document.querySelector(selector),$$=selector=>Array.from(document.querySelectorAll(selector));
const assert=(value,message)=>{if(!value)throw new Error(message);checks.push(message);};
const calendar=$('#rf-calendar'),snapshot=CalendarApp.exportSnapshot();
const originalSet=Element.prototype.setPointerCapture,originalHas=Element.prototype.hasPointerCapture;
Element.prototype.setPointerCapture=()=>{};Element.prototype.hasPointerCapture=()=>false;
const cell=$$('.rf-date[data-date]')[8],bounds=cell.getBoundingClientRect();
const origin={x:bounds.left+bounds.width/2,y:bounds.top+10};
const send=(target,type,x,y)=>target.dispatchEvent(new PointerEvent(type,{pointerId:41,isPrimary:true,button:0,bubbles:true,cancelable:true,clientX:x,clientY:y}));
try{
  send(cell,'pointerdown',origin.x,origin.y);
  assert(!!$('.rf-range-preview.is-visible'),'48: pointer down produces the range strip');
  const other=$$('.rf-date[data-date]')[16].getBoundingClientRect();
  send(cell,'pointermove',other.left+other.width/2,other.top+10);
  assert($$('.rf-range-preview.is-visible').length===2,'48: moving across weeks extends the range strip');
  send(cell,'pointerup',-10,-10);
  assert(!$('.rf-form')&&!$('.rf-range-preview.is-visible')&&CalendarApp.exportSnapshot()===snapshot,'48: release outside the calendar cancels creation without changing data');
  cell.click();assert(!$('.rf-form'),'48: a ghost click following cancelled drag cannot create a requirement');
  await new Promise(resolve=>setTimeout(resolve,450));
  cell.click();assert(!!$('.rf-form')&&!!$('.rf-range-preview.is-visible'),'48: a subsequent deliberate date click still creates a draft');
  await CalendarApp.command('close');
  send(cell,'pointerdown',origin.x,origin.y);window.dispatchEvent(new Event('blur'));
  assert(!$('.rf-range-preview.is-visible'),'48: losing window focus cancels a pending gesture');
}finally{Element.prototype.setPointerCapture=originalSet;Element.prototype.hasPointerCapture=originalHas;}
return {checks,scope:'synthetic WebKit events with pointer-capture bookkeeping stubbed; trusted mouse release remains a manual gate'};
