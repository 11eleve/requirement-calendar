const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const source=fs.readFileSync(require('node:path').join(__dirname,'../../src/components/startup.js'),'utf8');
function harness({reduced=false,hidden=false,animate=true,throws=false}={}){
 class Target{constructor(){this.listeners=new Map();}addEventListener(name,fn){if(!this.listeners.has(name))this.listeners.set(name,new Set());this.listeners.get(name).add(fn);}removeEventListener(name,fn){this.listeners.get(name)?.delete(fn);}emit(name){for(const fn of [...(this.listeners.get(name)||[])])fn();}count(){return [...this.listeners.values()].reduce((sum,x)=>sum+x.size,0);}}
 class Element extends Target{constructor(){super();this.children=[];this.attributes={};}append(...children){for(const child of children){this.children.push(child);child.parent=this;}}setAttribute(name,value){this.attributes[name]=value;}remove(){this.parent.children=this.parent.children.filter(x=>x!==this);}}
 const animations=[];
 if(animate)Element.prototype.animate=function(){if(throws===true||throws===animations.length+1)throw Error('unsupported effect');let complete,reject;const finished=new Promise((r,j)=>{complete=r;reject=j;});const animation={finished,complete,cancel(){this.cancelled=true;reject(Error('cancelled'));}};animations.push(animation);return animation;};
 const root=new Element(),document=new Target(),window=new Target(),motion=new Target(),timers=new Map();
 document.visibilityState=hidden?'hidden':'visible';document.createElement=()=>new Element();document.getElementById=()=>root;motion.matches=reduced;
 const context={window,document,Element,matchMedia:()=>motion,setTimeout:fn=>{const id=timers.size+1;timers.set(id,fn);return id;},clearTimeout:id=>timers.delete(id)};
 vm.createContext(context);vm.runInContext(source.replace('CalendarStartup.play(document.getElementById(\'req-calendar-refined\'));',''),context);
 return {root,document,window,motion,animations,timers,play:()=>window.CalendarStartup.play(root),listeners:()=>window.count()+document.count()+motion.count()};
}
test('launch is decorative, runs once and cleans every animation/listener after finishing',async()=>{const h=harness(),run=h.play();assert.equal(h.root.children.length,1);assert.equal(h.root.children[0].attributes['aria-hidden'],'true');assert.equal(h.animations.length,3);assert.equal(h.play(),null);h.animations[2].complete();await run.finished;assert.equal(h.root.children.length,0);assert.equal(h.listeners(),0);assert.equal(h.timers.size,0);assert.ok(h.animations.every(x=>x.cancelled));assert.equal(h.play(),null);});
test('pointer and keyboard input immediately remove the cover without consuming the event',async()=>{for(const event of ['pointerdown','keydown']){const h=harness(),run=h.play();h.window.emit(event);await run.finished;assert.equal(h.root.children.length,0);assert.equal(h.listeners(),0);run.cancel();assert.equal(h.listeners(),0);}});
test('reduced motion, hidden page and missing animation API enter directly',()=>{for(const options of [{reduced:true},{hidden:true},{animate:false}]){const h=harness(options);assert.equal(h.play(),null);assert.equal(h.root.children.length,0);assert.equal(h.listeners(),0);}});
test('live preference, page hide and fallback deadline cancel safely',async()=>{for(const trigger of ['preference','hidden','pagehide','deadline']){const h=harness(),run=h.play();if(trigger==='preference'){h.motion.matches=true;h.motion.emit('change');}if(trigger==='hidden'){h.document.visibilityState='hidden';h.document.emit('visibilitychange');}if(trigger==='pagehide')h.window.emit('pagehide');if(trigger==='deadline')[...h.timers.values()][0]();await run.finished;assert.equal(h.root.children.length,0);assert.equal(h.listeners(),0);assert.equal(h.timers.size,0);}});
test('an animation construction failure leaves the app uncovered',async()=>{for(const throws of [true,2,3]){const h=harness({throws}),run=h.play();await run.finished;assert.equal(h.root.children.length,0);assert.equal(h.listeners(),0);assert.ok(h.animations.every(x=>x.cancelled));}});
