// Measure resolved WebKit colors, not palette literals. This covers the listed
// text contexts only, not a complete accessibility conformance assessment.
const checks=[], $=s=>document.querySelector(s), $$=s=>Array.from(document.querySelectorAll(s));
const assert=(value,message)=>{if(!value)throw new Error(message);checks.push(message);};
// Static layout/focus checks complete animation endpoints; no display-frame measurement.
const settle=async()=>{document.getAnimations().forEach(a=>a.finish());await new Promise(resolve=>setTimeout(resolve,30));document.getAnimations().forEach(a=>a.finish());};
const tones=['','blue','green'];
assert(await CalendarApp.restoreSnapshot(JSON.stringify({version:6,anchor:'2026-10-01',requirements:tones.map((tone,i)=>({id:'read-'+i,title:'阶段文字可读性',tone,start:'2026-10-01',end:'2026-10-31',phases:[{name:'评审',start:'2026-10-01',end:'2026-10-09'},{name:'开发',start:'2026-10-10',end:'2026-10-31'}],resources:[{name:'需求说明',type:'自定义资料',url:'https://example.com'}],tasks:['确认阶段日期'],done:[true],note:'保留阅读层次。'}))})),'isolated reading fixture restored');await settle();
const context=document.createElement('canvas').getContext('2d');
const rgb=color=>{context.clearRect(0,0,1,1);context.fillStyle=color;context.fillRect(0,0,1,1);return Array.from(context.getImageData(0,0,1,1).data).slice(0,3);};
const luminance=components=>components.map(c=>{c/=255;return c<=.04045?c/12.92:((c+.055)/1.055)**2.4;}).reduce((sum,c,i)=>sum+c*[.2126,.7152,.0722][i],0);
const ratio=(foreground,background)=>{const a=luminance(foreground),b=luminance(background);return (Math.max(a,b)+.05)/(Math.min(a,b)+.05);};
const samples=[];
function measure(name,node,background,pseudo=null){const style=getComputedStyle(node,pseudo),opacity=Number(style.opacity),back=rgb(background),front=rgb(style.color).map((c,i)=>c*opacity+back[i]*(1-opacity));const contrast=ratio(front,back);samples.push({name,foreground:style.color,opacity,background,contrast});return contrast;}
const phases=$$('.rf-phase');
assert(tones.every((tone,i)=>$$('.rf-bar').some(bar=>bar.dataset.requirementId==='read-'+i&&bar.querySelector('.phase-alt'))),'all three requirement tones include both phase fills');
assert(phases.every(node=>measure('phase '+node.closest('.rf-bar').dataset.requirementId+(node.classList.contains('phase-alt')?' alternate':''),node,getComputedStyle(node).backgroundColor)>=4.5),'phase text exceeds 4.5 against normal and alternating fills');
const outside=$('.rf-date.outside');
assert(measure('outside date',outside,getComputedStyle(outside).backgroundColor)>=4.5,'interactive dates outside the month remain readable');
CalendarApp.openRequirement('read-0');await settle();
assert($$('.rf-resource-text small,.rf-task span,.rf-note').every(node=>measure('detail '+node.className,node,getComputedStyle(node.closest('.rf-section')).backgroundColor)>=4.5),'resource types, completed tasks and notes retain readable secondary text');
CalendarApp.editRequirement('read-0');await settle();
const tabs=$$('.rf-editor-tab'),tabBackground=getComputedStyle($('.rf-editor-tabs')).backgroundColor;
assert(measure('inactive editor tab',tabs[1],tabBackground)>=4.5,'the other editor tab remains legible on the segmented background');
const placeholder=$('.rf-form input[placeholder]');
// Transparent title inputs inherit the visible surface from their ancestors.
const surface=node=>{for(let current=node;current;current=current.parentElement){const color=getComputedStyle(current).backgroundColor;if(color!=='rgba(0, 0, 0, 0)'&&color!=='transparent')return color;}throw Error('No opaque field surface');};
assert(measure('field placeholder',placeholder,surface(placeholder),'::placeholder')>=4.5,'field placeholder text remains readable on its input surface');
const label=$('.rf-field>span');
assert(measure('field label',label,getComputedStyle($('#rf-detail')).backgroundColor)>=4.5,'form labels preserve hierarchy with sufficient text contrast');
tabs[1].click();await settle();
assert($$('.rf-phase-summary .rf-summary-name,.rf-phase-summary .rf-summary-meta').every(node=>measure('phase editor '+node.className,node,getComputedStyle($('#rf-detail')).backgroundColor)>=4.5),'phase editing names and full dates retain readable primary and secondary text');
// Composite the thin range shape over the actual date-label surfaces.
const rangeContrasts=[];
for(let i=0;i<tones.length;i++){
 CalendarApp.editRequirement('read-'+i);await settle();
 const strip=$('.rf-range-preview.is-visible'),style=getComputedStyle(strip),alpha=Number(style.opacity),fill=rgb(style.backgroundColor);
 for(const selector of ['.rf-date[data-date="2026-10-01"] .rf-date-label','.rf-date[data-date="2026-10-03"] .rf-date-label','.rf-date.outside .rf-date-label']){
  const background=getComputedStyle($(selector)).backgroundColor,back=rgb(background),front=fill.map((c,j)=>c*alpha+back[j]*(1-alpha)),contrast=ratio(front,back);
  rangeContrasts.push(contrast);samples.push({name:'range '+i+' '+selector,foreground:style.backgroundColor,opacity:alpha,background,contrast});
 }
}
assert(rangeContrasts.every(value=>value>=3),'range strips remain distinct on weekday, weekend and adjacent-month date surfaces in all tones');
return {checks,samples,appearance:matchMedia('(prefers-color-scheme:dark)').matches?'dark':'light',reference:'https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html',scope:'resolved foreground/background colors for the listed text contexts in actual WebKit; does not assess the entire app, assistive technology, anti-aliasing or user aesthetic preference'};
