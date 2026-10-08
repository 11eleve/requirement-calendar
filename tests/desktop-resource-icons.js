// Verify the actual resource reading/editing flow, including local SVG rendering.
const checks=[], $=s=>document.querySelector(s), $$=s=>Array.from(document.querySelectorAll(s));
const assert=(value,message)=>{if(!value)throw new Error(message);checks.push(message);};
const settle=async()=>{document.getAnimations().forEach(a=>a.finish());void document.querySelector('#rf-panel').offsetWidth;document.getAnimations().forEach(a=>a.finish());};
const resources=[{name:'需求说明',type:'PRD',url:'https://alidocs.com/doc/plan'},{name:'交互与视觉',type:'设计稿',url:'https://www.figma.com/design/plan'},{name:'代码仓库',type:'代码',url:'https://github.com/example/project'},{name:'交互说明',type:'交互设计',url:'https://example.com/design'},{name:'接口契约',type:'接口',url:'https://example.com/api'},{name:'参考资料',type:'自定义',url:'https://example.com/reference'},{name:'原有自定义标识',type:'自定义',url:'',icon:'∆'}];
assert(await CalendarApp.restoreSnapshot(JSON.stringify({version:6,anchor:'2026-10-01',requirements:[{id:'icons',title:'资料图标验收',start:'2026-10-01',end:'2026-10-31',phases:[],resources,tasks:[],done:[],note:''}]})),'isolated resource fixture restored');
CalendarApp.openRequirement('icons');await settle();
const symbols=$$('.rf-resource-row .rf-resource-symbol');
assert(symbols.map(svg=>svg.dataset.symbol).join(',')==='dingtalk,figma,repository,design,code,document','resource links and custom types receive recognizable brand or type symbols');
assert(symbols.every(svg=>svg.namespaceURI==='http://www.w3.org/2000/svg'&&svg.getAttribute('aria-hidden')==='true'),'resource symbols render as decorative SVG without duplicating accessible names');
assert($$('.rf-resource-row a').length===0&&$$('a.rf-resource-row').every((node,index)=>node.href===resources[index].url),'resource names and destinations remain on their original clickable rows');
assert(!$('.rf-resource-icon img,.rf-resource-icon use,.rf-resource-icon image')&&symbols.every(svg=>!svg.querySelector('[href],[src]')),'every resource symbol is self-contained rather than loading an external image');
assert($$('.rf-resource-icon').at(-1).textContent==='∆','legacy custom text symbols remain available');
assert(['constructor','__proto__','<img src=x onerror=alert(1)>'].every(value=>{const node=CalendarIcons.symbol(value);return node.nodeType===Node.TEXT_NODE&&node.textContent===value;}),'unrecognized imported symbols stay literal text, including reserved property names');
CalendarApp.editRequirement('icons');await settle();
assert($$('.rf-item-summary .rf-resource-symbol').length===6&&!CalendarApp.hasUnsavedChanges(),'collapsed edit rows retain their symbols without modifying data');
const row=$$('[data-editor-panel=basic] .rf-disclosure')[1];row.open=true;await settle();
const fields=row.querySelectorAll('input'),type=fields[1],url=fields[2];
for(const [control,value] of [[url,'https://example.com/contract'],[type,'接口约定']]){control.value=value;control.dispatchEvent(new Event('input',{bubbles:true}));}
assert(row.querySelector('.rf-resource-symbol').dataset.symbol==='code'&&row.querySelector('.rf-resource-icon').dataset.kind==='码','editing a link and type updates the symbol and badge together');
assert(await CalendarApp.command('save'),'updated resource metadata saves through the native file bridge');await settle();
const saved=JSON.parse(CalendarApp.exportSnapshot()).requirements[0];
assert(saved.resources[1].icon==='码'&&saved.resources[1].url==='https://example.com/contract'&&saved.resources[6].icon==='∆','stored resources preserve their existing data format and custom symbols');
assert($$('.rf-resource-row .rf-resource-symbol')[1].dataset.symbol==='code','saved details display the updated resource symbol');
return {checks,appearance:matchMedia('(prefers-color-scheme:dark)').matches?'dark':'light',scope:'real WebKit SVG, links and edit/save flow with isolated data; network icons disabled in this deterministic fallback suite; no browser tab lookup'};
