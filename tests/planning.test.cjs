const test=require('node:test'),assert=require('node:assert/strict'),Model=require('../src/model.js'),Storage=require('../src/storage.js');
const fixture=(overrides={})=>({id:'planning',title:'跨月认证改造',start:'2028-02-27',end:'2028-03-10',tone:'rose',phases:[],resources:[],tasks:[],done:[],note:'\n    contract  ',milestones:[{id:'release',name:'灰度发布',date:'2028-03-08',kind:'release',done:false},{id:'review',name:'方案评审',date:'2028-02-29',kind:'review',done:true}],...overrides});
test('planning: all palette colors and node kinds persist; migration keeps originals and blocks future schemas',()=>{
 const old=JSON.stringify({version:6,anchor:'2028-02-01',requirements:[fixture({tone:'blue',milestones:undefined})]});
 const database=new Map([['requirement-calendar:state:v6',old]]),memory={getItem:key=>database.get(key)??null,setItem:(key,value)=>database.set(key,value)};
 const store=Storage.createStore(memory),loaded=store.load();assert.equal(loaded.data.version,7);assert.deepEqual(loaded.data.requirements[0].milestones,[]);assert.equal(database.get('requirement-calendar:state:v6'),old);
 for(const tone of Model.TONES){const item=Model.requirement(fixture({tone:tone.id}));assert.equal(item.tone,tone.id);assert.equal(store.save({version:7,anchor:'2028-02-01',requirements:[item]}).ok,true);assert.deepEqual(store.load().data.requirements[0],item);}
 assert.equal(Model.TONES.length,8);assert.equal(new Set(Model.TONES.map(tone=>tone.color)).size,8);
 assert.throws(()=>Model.snapshot({version:8,anchor:'2028-02-01',requirements:[]}),/版本/);
});
test('planning: nodes sort by date without dropping same-day nodes and reject corrupt imports',()=>{
 const item=Model.requirement(fixture());assert.deepEqual(item.milestones.map(node=>node.id),['review','release']);
 const node={id:'n',name:'验收',date:'2028-02-29',kind:'checkpoint',done:false};
 assert.equal(Model.requirement(fixture({milestones:[node,{...node,id:'n2'}]})).milestones.length,2);
 for(const change of [{date:'2028-02-26'},{date:'2028-03-11'},{date:'2028-02-30'},{name:' '},{kind:'x'},{done:1}])assert.throws(()=>Model.requirement(fixture({milestones:[{...node,...change}]})),/节点/);
 assert.throws(()=>Model.requirement(fixture({milestones:[node,node]})),/重复/);
 assert.throws(()=>Model.requirement(fixture({milestones:{}})),/节点/);
});
test('planning: whole-plan shifts preserve node identity, kind and completion across leap days and do not mutate saved data',()=>{
 const original=Model.requirement(fixture()),raw=JSON.stringify(original),next=Model.shiftRequirement(original,3);
 assert.deepEqual(next.milestones,[{...original.milestones[0],date:'2028-03-03'},{...original.milestones[1],date:'2028-03-11'}]);
 assert.equal(JSON.stringify(original),raw);assert.deepEqual(Model.shiftRequirement(next,-3),original);
});
const Planning=require('../src/planning.js');
test('summary: time status is distinct from actual completion and phase gaps remain active',()=>{
 const item=Model.requirement(fixture({tasks:['契约','回滚'],done:[true,false]}));
 assert.equal(Planning.status(item,'2028-02-26'),'upcoming');assert.equal(Planning.status(item,'2028-03-11'),'past');assert.equal(Planning.status(item,'2028-03-01'),'active');assert.equal(Planning.currentPhase(item,'2028-03-01'),'');
 assert.equal(Planning.status({...item,done:[true,true]},'2028-03-11'),'past');
 assert.equal(Planning.status({...item,done:[true,true],milestones:item.milestones.map(node=>({...node,done:true}))},'2028-03-01'),'completed');
 assert.equal(Planning.status({...item,tasks:[],done:[],milestones:[]},'2028-03-01'),'active');assert.deepEqual(Planning.progress(item),{total:2,done:1,ratio:.5});
});
test('summary: month uses actual month bounds, searches context and filters nodes consistently without mutation',()=>{
 const items=[Model.requirement(fixture()),Model.requirement(fixture({id:'adjacent',start:'2028-03-01',end:'2028-03-10',milestones:[],resources:[{name:'接口契约',type:'文档',url:''}]}))],copy=JSON.stringify(items);
 const feb=Planning.project(items,{anchor:'2028-02-01',today:'2028-02-29'});assert.equal(feb.rows.length,1);assert.equal(feb.nodes.length,1);assert.equal(feb.nodes[0].node.id,'release');
 const all=Planning.project(items,{anchor:'2028-02-01',today:'2028-02-29',scope:'all',query:'接口契约'});assert.deepEqual(all.rows.map(row=>row.item.id),['adjacent']);assert.equal(all.nodes.length,0);assert.equal(all.counts.upcoming,1);
 const filtered=Planning.project(items,{anchor:'2028-02-01',today:'2028-02-29',scope:'all',tone:'blue'});assert.equal(filtered.rows.length,0);
 assert.equal(Planning.project(items,{anchor:'2028-02-01',today:'2028-02-29',scope:'all',state:'upcoming'}).rows.length,1);assert.equal(JSON.stringify(items),copy);
});
test('workflow: search finds combined task, resource type and URL terms without changing records',()=>{
 const item=Model.requirement(fixture({title:'认证迁移',tasks:['验证 rollback 条件'],done:[false],resources:[{name:'API',type:'OpenAPI 契约',url:'https://example.com/auth/v2'}]})),copy=JSON.stringify(item),options={anchor:item.start,today:item.start,scope:'all'};
 for(const query of ['认证 rollback','openapi /auth/v2',' 认证   契约 ','ROLLBACK'])assert.equal(Planning.project([item],{...options,query}).rows.length,1,query);
 assert.equal(Planning.project([item],{...options,query:'认证 unrelated'}).rows.length,0);
 assert.equal(JSON.stringify(item),copy);
});
test('workflow: node completion remains distinct from task progress, including node-only requirements',()=>{
 const item=Model.requirement(fixture());assert.deepEqual(Planning.nodeProgress(item),{total:2,done:1});assert.deepEqual(Planning.progress(item),{total:0,done:0,ratio:null});
 const row=Planning.project([item],{anchor:item.start,today:item.start}).rows[0];assert.equal(row.nodes.done,1);assert.equal(row.progress.ratio,null);assert.notEqual(row.status,'completed');
 assert.equal(Planning.status({...item,milestones:item.milestones.map(node=>({...node,done:true}))},item.start),'completed');
});
test('summary ordering: next pending node takes priority over requirement start and empty plans follow dated plans',()=>{
 const early=Model.requirement(fixture({id:'early',title:'先开始',milestones:[{id:'done',name:'已完成评审',date:'2028-02-27',kind:'review',done:true},{id:'later',name:'后续发布',date:'2028-03-08',kind:'release',done:false}]}));
 const urgent=Model.requirement(fixture({id:'urgent',title:'下一节点更早',start:'2028-02-28',milestones:[{id:'pending',name:'接口评审',date:'2028-02-29',kind:'review',done:false}]}));
 const noPending=Model.requirement(fixture({id:'none',title:'没有待办',milestones:[]}));
 const items=[early,noPending,urgent],copy=JSON.stringify(items),options={anchor:early.start,today:early.start,scope:'all',sort:'next'};
 assert.deepEqual(Planning.project(items,options).rows.map(row=>row.item.id),['urgent','early','none']);
 assert.equal(Planning.project(items,options).rows[0].next.id,'pending');
 const completed={...urgent,milestones:urgent.milestones.map(node=>({...node,done:true}))};
 assert.equal(Planning.project([completed,early],options).rows[0].item.id,'early');assert.equal(JSON.stringify(items),copy);
});
test('summary ordering: unknown task progress follows zero and complete progress instead of implying overdue work',()=>{
 const unknown=Model.requirement(fixture({id:'unknown',milestones:[]})),zero=Model.requirement(fixture({id:'zero',tasks:['接口联调'],done:[false]})),complete=Model.requirement(fixture({id:'complete',tasks:['接口联调'],done:[true]}));
 const options={anchor:unknown.start,today:unknown.start,scope:'all',sort:'progress'};
 assert.deepEqual(Planning.project([unknown,complete,zero],options).rows.map(row=>row.item.id),['zero','complete','unknown']);
 assert.equal(Planning.project([unknown],options).rows[0].progress.ratio,null);
});
