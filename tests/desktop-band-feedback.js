// Shared identity feedback on real native WebKit continuation pieces.
// Input is synthetic; capture bookkeeping is stubbed, not a trusted mouse test.
const checks=[],$=s=>document.querySelector(s),$$=s=>Array.from(document.querySelectorAll(s));
const assert=(ok,message)=>{if(!ok)throw Error(message);checks.push(message);};
const item=(id,title,tone,start,end,phases=[])=>({id,title,tone,start,end,phases,resources:[],tasks:[],done:[],note:''});
const requirements=[
 item('purple','结算流程改版','','2026-10-01','2026-10-25',[{name:'评审',start:'2026-10-01',end:'2026-10-04'},{name:'开发与联调',start:'2026-10-06',end:'2026-10-20'},{name:'验收',start:'2026-10-22',end:'2026-10-25'}]),
 item('blue','认证服务迁移','blue','2026-10-05','2026-10-18',[{name:'方案确认',start:'2026-10-05',end:'2026-10-07'},{name:'开发与灰度验证',start:'2026-10-08',end:'2026-10-18'}]),
 item('green','报表导出优化','green','2026-10-19','2026-10-30',[{name:'开发',start:'2026-10-19',end:'2026-10-25'},{name:'验收',start:'2026-10-26',end:'2026-10-30'}])
];
assert(await CalendarApp.restoreSnapshot(JSON.stringify({version:6,anchor:'2026-10-01',requirements})),'fixture with three tones and cross-week requirements restored');
const snapshot=CalendarApp.exportSnapshot(),calendar=$('#rf-calendar'),root=$('#req-calendar-refined');
const bars=id=>$$('.rf-bar[data-requirement-id="'+id+'"]');
const point=bar=>{const r=bar.getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2};};
const send=(bar,type,extra={})=>bar.dispatchEvent(new PointerEvent(type,{pointerId:81,pointerType:'mouse',isPrimary:true,button:0,bubbles:true,cancelable:true,...point(bar),clientX:point(bar).x,clientY:point(bar).y,...extra}));
const settle=async()=>{document.getAnimations().forEach(a=>a.finish());await new Promise(r=>setTimeout(r,30));document.getAnimations().forEach(a=>a.finish());};
const rects=()=>$$('.rf-bar').map(n=>{const r=n.getBoundingClientRect();return [n.dataset.requirementId,r.x,r.y,r.width,r.height];});
const geometry=JSON.stringify(rects()),styles=[];
const canvas=document.createElement('canvas'),context=canvas.getContext('2d');canvas.width=canvas.height=1;
const rgb=color=>{context.clearRect(0,0,1,1);context.fillStyle=color;context.fillRect(0,0,1,1);return [...context.getImageData(0,0,1,1).data].slice(0,3);};
const lum=color=>rgb(color).map(c=>{c/=255;return c<=.04045?c/12.92:((c+.055)/1.055)**2.4;}).reduce((sum,c,i)=>sum+c*[.2126,.7152,.0722][i],0);
const contrast=(a,b)=>{a=lum(a);b=lum(b);return (Math.max(a,b)+.05)/(Math.min(a,b)+.05);};
const capture={set:Element.prototype.setPointerCapture,has:Element.prototype.hasPointerCapture};
Element.prototype.setPointerCapture=()=>{};Element.prototype.hasPointerCapture=()=>false;
try{
 for(const id of ['purple','blue','green']){
  const pieces=bars(id),first=pieces[0],last=pieces.at(-1);assert(pieces.length>1,id+' fixture has continuation pieces');
  const idle=getComputedStyle(first).borderColor;
  send(first.querySelector('.rf-bar-title'),'pointerover');await settle();
  assert(pieces.every(n=>n.classList.contains('is-hovered'))&&$$('.rf-bar.is-hovered').length===pieces.length,id+' child hover identifies only this complete requirement');
  const hovered=pieces.map(n=>getComputedStyle(n).borderColor);
  assert(hovered.every(c=>c===hovered[0])&&hovered[0]!==idle,id+' hover resolves to one shared border color across all pieces');
  send(first,'pointerout',{relatedTarget:first.querySelector('.rf-phase')||first.querySelector('.rf-bar-title')});
  assert(pieces.every(n=>n.classList.contains('is-hovered')),id+' moving within a band does not clear feedback');
  send(first,'pointerout',{relatedTarget:last});send(last,'pointerover',{relatedTarget:first});
  assert(pieces.every(n=>n.classList.contains('is-hovered')),id+' crossing to another continuation preserves the identity');
  send(last,'pointerdown');await settle();
  assert(pieces.every(n=>n.classList.contains('is-pressed'))&&$$('.rf-bar.is-pressed').length===pieces.length,id+' press applies to the full requirement before the drag threshold');
  const pressed=getComputedStyle(first),ratio=contrast(pressed.color,pressed.backgroundColor);
  assert(pressed.borderColor!==hovered[0]&&ratio>=4.5,id+' press remains distinct and title text exceeds 4.5 contrast');
  styles.push({id,idleBorder:idle,hoverBorder:hovered[0],pressedBorder:pressed.borderColor,pressedFill:pressed.backgroundColor,titleContrast:ratio});
  send(last,'pointercancel');await settle();
  assert(!$('.rf-bar.is-pressed')&&!$('.rf-bar.is-hovered')&&!$('.rf-bar.is-moving'),id+' pointer cancellation clears temporary feedback');
 }
 const blue=bars('blue'),green=bars('green');
 send(blue[0],'pointerover');send(blue[0],'pointerout',{relatedTarget:green[0]});send(green[0],'pointerover',{relatedTarget:blue[0]});
 assert(!blue.some(n=>n.classList.contains('is-hovered'))&&green.every(n=>n.classList.contains('is-hovered')),'crossing requirements transfers hover without stale pieces');
 send(green[0],'pointerout',{relatedTarget:calendar.querySelector('.rf-date')});
 assert(!$('.rf-bar.is-hovered'),'leaving a requirement for a date clears hover');
 send(blue[0],'pointerover',{pointerType:'touch'});
 assert(!$('.rf-bar.is-hovered'),'touch input does not leave simulated hover feedback');
 blue[0].focus({preventScroll:true});
 assert(blue.every(n=>n.classList.contains('is-focused'))&&!green.some(n=>n.classList.contains('is-focused')),'focus identifies all and only the focused requirement continuations');
 const focusVisible=blue[0].matches(':focus-visible'),focusStyle=getComputedStyle(blue[0]);
 if(focusVisible)assert(rgb(focusStyle.outlineColor).join(',')===rgb(focusStyle.color).join(','),'visible blue keyboard outline uses its own tone');
 green[0].focus({preventScroll:true});
 assert(green.every(n=>n.classList.contains('is-focused'))&&!blue.some(n=>n.classList.contains('is-focused')),'moving focus transfers the complete requirement identity');
 $('#rf-next').focus({preventScroll:true});assert(!$('.rf-bar.is-focused'),'leaving calendar focus clears continuation feedback');
 send(blue[0],'pointerover');send(blue[0],'pointerdown');send(blue[0],'pointermove',{clientX:point(blue[0]).x+12});
 assert(root.classList.contains('is-replanning')&&!$('.rf-bar.is-hovered')&&!$('.rf-bar.is-pressed')&&blue.every(n=>n.classList.contains('is-moving')),'replan threshold replaces hover and press with moving feedback');
 window.dispatchEvent(new Event('blur'));assert(!$('.rf-bar.is-moving')&&!$('.rf-bar.is-pressed')&&!$('.rf-bar.is-hovered'),'window focus loss clears held and hover feedback');
 send(blue[0],'pointerover');send(blue[0],'pointerdown');send(blue[0],'pointerup');blue[0].click();await settle();
 assert(!$('.rf-bar.is-hovered')&&!$('.rf-bar.is-focused')&&blue.every(n=>n.classList.contains('is-selected')),'opening details clears transient feedback while retaining selected identity');
 await CalendarApp.command('close');await settle();
 assert(JSON.stringify(rects())===geometry,'feedback preserves every bar position, size and calendar lane');
 assert(CalendarApp.exportSnapshot()===snapshot&&!CalendarApp.hasUnsavedChanges(),'feedback never changes dates, phases or saved data');
 send(bars('blue')[0],'pointerover');await CalendarApp.command('next');await settle();
 assert(!$('.rf-bar.is-hovered')&&!$('.rf-bar.is-focused')&&!$('.rf-bar.is-pressed'),'month navigation leaves no stale transient state');
 await CalendarApp.command('previous');await settle();
 assert(!$('.rf-bar.is-hovered')&&!$('.rf-bar.is-focused')&&!$('.rf-bar.is-pressed'),'returning to the month starts with quiet bands');
 assert(document.documentElement.scrollHeight<=innerHeight+1&&calendar.scrollWidth<=calendar.clientWidth+1,'feedback creates no page or calendar horizontal overflow');
 // Endpoint screenshot of one complete hovered requirement; no pressed/drag state.
 send(bars('blue')[0],'pointerover');await settle();
 return {checks,styles,focusVisible,geometry:rects(),scope:'actual isolated native WebKit continuation styling, geometry and persistence; synthetic hover/focus/pointer events with capture bookkeeping stubbed; completed transition endpoints, not trusted pointer motion or aesthetic acceptance'};
}finally{Element.prototype.setPointerCapture=capture.set;Element.prototype.hasPointerCapture=capture.has;}
