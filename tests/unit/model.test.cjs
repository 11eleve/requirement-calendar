const test = require('node:test');
const assert = require('node:assert/strict');
const Model = require('../../src/domain/model.js');
const Storage = require('../../src/services/storage.js');

const requirement = (overrides = {}) => ({ id: 'req-1', title: '支付改版', tone: '', start: '2026-10-07', end: '2026-10-14', phases: [{ name: '开发', start: '2026-10-08', end: '2026-10-12' }], resources: [{ name: 'PRD', type: '文档', url: 'https://alidocs.com/doc/1' }], tasks: ['确认验收范围'], done: [false], note: '', ...overrides });
const snapshot = (requirements = [requirement()]) => ({ version: 5, anchor: '2026-10-07', requirements });
function memory(initial = {}) {
  const data = new Map(Object.entries(initial));
  return { getItem: key => data.has(key) ? data.get(key) : null, setItem: (key, value) => data.set(key, value), data };
}

test('02: device-local date crosses midnight correctly and date arithmetic survives DST', () => {
  const previous = process.env.TZ;
  try {
    process.env.TZ = 'Asia/Shanghai'; assert.equal(Model.localDate(new Date('2026-10-07T16:30:00Z')), '2026-10-08');
    process.env.TZ = 'America/Los_Angeles'; assert.equal(Model.localDate(new Date('2026-10-07T16:30:00Z')), '2026-10-07');
    assert.equal(Model.add('2026-03-07', 2), '2026-03-09'); assert.equal(Model.days('2026-03-07', '2026-03-09'), 2);
    assert.equal(Model.add('2028-02-28', 1), '2028-02-29'); assert.equal(Model.validDate('2026-02-29'), false);
  } finally { if (previous === undefined) delete process.env.TZ; else process.env.TZ = previous; }
});

test('03: fast creation uses unique IDs and duplicate persisted identities are rejected', () => {
  assert.equal(new Set(Array.from({ length: 1000 }, () => Model.newId())).size, 1000);
  assert.throws(() => Model.snapshot(snapshot([requirement(), requirement()])), /标识重复/);
});

test('04: phase rules reject impossible dates, outside phases, and inclusive overlaps', () => {
  assert.throws(() => Model.requirement(requirement({ phases: [{ name: '开发', start: '2026-10-06', end: '2026-10-12' }] })), /周期/);
  assert.throws(() => Model.requirement(requirement({ phases: [{ name: '开发', start: '2026-10-07', end: '2026-10-10' }, { name: '测试', start: '2026-10-10', end: '2026-10-14' }] })), /重叠/);
  assert.throws(() => Model.requirement(requirement({ start: '2026-02-30' })), /日期/);
  const result = Model.requirement(requirement({ phases: [{ name: '测试', start: '2026-10-13', end: '2026-10-14' }, { name: '开发', start: '2026-10-08', end: '2026-10-12' }] }));
  assert.equal(result.phases[0].name, '开发');
});

test('05: resources accept complete web links and reject unsafe or malformed values', () => {
  assert.equal(Model.safeURL(' https://figma.com/file/a '), 'https://figma.com/file/a');
  for (const url of ['javascript:alert(1)', 'file:///etc/passwd', 'https://user:pass@example.com', 'https://', 'https://example.com\n/path', 0, false]) assert.throws(() => Model.safeURL(url));
  assert.equal(Model.iconFor('https://example.com/figma.com'), '文');
  assert.equal(Model.iconFor('https://www.figma.com/file/a'), 'F');
});

test('06: task progress cannot be restored from mismatched or nonboolean completion values', () => {
  assert.throws(() => Model.requirement(requirement({ done: ['false'] })), /事项/);
  assert.throws(() => Model.requirement(requirement({ done: [] })), /事项/);
  assert.throws(() => Model.requirement(requirement({ tasks: [' '] })), /事项/);
  assert.deepEqual(Model.requirement(requirement({ done: [true] })).done, [true]);
});

test('07: more than 16 requirements and over 14.5 KB survive a real serialize/reload cycle', () => {
  const database = memory(), store = Storage.createStore(database);
  const requirements = Array.from({ length: 100 }, (_, index) => requirement({ id: 'req-' + index, note: '实现说明'.repeat(100) }));
  assert.equal(store.save(snapshot(requirements)).ok, true);
  assert.ok(database.getItem(Storage.KEY).length > 14500);
  const reopened = Storage.createStore(database).load(); assert.equal(reopened.data.requirements.length, 100);
  assert.equal(reopened.data.requirements[99].note, requirements[99].note);
});

test('08: version 4 migration preserves requirements and the original legacy record', () => {
  const legacy = JSON.stringify({ privateContent: { ...snapshot(), version: 4 } });
  const database = memory({ legacy }), store = Storage.createStore(database, { legacyKey: 'legacy' });
  const loaded = store.load(); assert.equal(loaded.migrated, true); assert.equal(loaded.data.version, Model.VERSION); assert.equal(loaded.data.requirements[0].title, '支付改版');
  assert.equal(store.save(loaded.data).ok, true); assert.equal(database.getItem('legacy'), legacy);
  assert.equal(Storage.createStore(database).load().data.requirements.length, 1);
});

test('09: a quota failure reports failure and leaves the committed primary record intact', () => {
  const before = JSON.stringify(Model.snapshot(snapshot())), database = memory({ [Storage.KEY]: before });
  const baseSet = database.setItem;
  database.setItem = (key, value) => { if (key === Storage.KEY) throw new Error('QuotaExceeded'); baseSet(key, value); };
  const result = Storage.createStore(database).save(snapshot([requirement({ title: '尚未保存' })]));
  assert.equal(result.ok, false); assert.match(result.issue, /保存失败/); assert.equal(database.getItem(Storage.KEY), before);
});

test('10: corrupted records recover from last-good data; unrecoverable data blocks overwrite', () => {
  const database = memory({ [Storage.KEY]: '{broken', [Storage.BACKUP_KEY]: JSON.stringify(snapshot()) });
  const store = Storage.createStore(database), recovered = store.load();
  assert.equal(recovered.data.requirements[0].title, '支付改版'); assert.match(recovered.issue, /恢复/); assert.equal(database.getItem(Storage.KEY), '{broken');
  const broken = memory({ [Storage.KEY]: '{broken' }), protectedStore = Storage.createStore(broken);
  assert.equal(protectedStore.load().data, null); assert.equal(protectedStore.save(snapshot()).ok, false); assert.equal(broken.getItem(Storage.KEY), '{broken');
  const future = memory({ [Storage.KEY]: JSON.stringify({ ...snapshot(), version: 999 }) }), futureStore = Storage.createStore(future);
  assert.equal(futureStore.load().data, null); assert.equal(futureStore.save(snapshot()).ok, false);
  const newer=memory({[Storage.KEY]:JSON.stringify({...snapshot(),version:999}),[Storage.BACKUP_KEY]:JSON.stringify(snapshot())}),guarded=Storage.createStore(newer);
  assert.equal(guarded.load().data,null);assert.equal(guarded.save(snapshot()).ok,false);
  assert.equal(store.save(snapshot()).ok,true);
  assert.ok([...database.data.entries()].some(([key,value])=>key.startsWith(Storage.KEY+':preserved:')&&value==='{broken'));
  const original=JSON.stringify(snapshot()),backupFailure=memory({[Storage.KEY]:original}),base=backupFailure.setItem;
  backupFailure.setItem=(key,value)=>{if(key===Storage.BACKUP_KEY)throw new Error('quota');base(key,value);};
  assert.equal(Storage.createStore(backupFailure).save(snapshot([requirement({title:'不得覆盖'})])).ok,false);
  assert.equal(backupFailure.getItem(Storage.KEY),original);
});

test('29: v5 browser records migrate to a native file through the bridge without deleting originals', async () => {
  const raw=JSON.stringify(snapshot());
  const database=memory({'requirement-calendar:state:v5':raw}),legacy=Storage.createStore(database);
  let written=null;
  const bridge={async postMessage(message){if(message.action==='load')return {raw:null,issue:null};written=JSON.parse(message.raw);return {ok:true};}};
  const store=Storage.createNativeStore(bridge,legacy),loaded=await store.load();
  assert.equal(loaded.migrated,true);assert.equal(loaded.issue,null);assert.equal(written.version,Model.VERSION);assert.equal(written.requirements[0].title,'支付改版');assert.equal(written.requirements[0].reminder,null);
  assert.equal(database.getItem('requirement-calendar:state:v5'),raw);
  bridge.postMessage=async()=>{throw new Error('another window changed the file');};
  const failed=await store.save(loaded.data);assert.equal(failed.ok,false);assert.match(failed.issue,/another window/);
});

test('32: optional local reminder validates real wall time, rejects DST gaps, and preserves schema migration', () => {
  const before=process.env.TZ;process.env.TZ='America/Los_Angeles';
  try {
    assert.equal(Model.validReminder('2027-03-14T02:30'),false);
    assert.equal(Model.validReminder('2027-03-14T03:30'),true);
    assert.equal(Model.validReminder('2026-02-30T09:00'),false);
    assert.equal(Model.validReminder('2026-10-20T25:00'),false);
    assert.equal(Model.requirement(requirement({reminder:'2026-10-20T09:00'})).reminder,'2026-10-20T09:00');
    assert.equal(Model.snapshot(snapshot()).version,Model.VERSION);
  } finally {if(before===undefined)delete process.env.TZ;else process.env.TZ=before;}
});

test('37: month navigation and grids retain early years, leap days, six weeks, and supported boundaries', () => {
  assert.equal(Model.monthOffset('0099-12-31', 1), '0100-01-01');
  assert.equal(Model.monthOffset('0001-01-01', -1), null);
  assert.equal(Model.monthOffset('9999-12-31', 1), null);
  assert.deepEqual(Model.monthGrid('0001-01-01'), { first: '0001-01-01', last: '0001-01-31', start: '0001-01-01', count: 5 });
  assert.equal(Model.monthGrid('2028-02-29').last, '2028-02-29');
  assert.equal(Model.monthGrid('2026-03-31').count, 6);
  assert.equal(Model.monthGrid('9999-12-31').last, '9999-12-31');
  assert.throws(() => Model.add('0001-01-01', -1));
  assert.throws(() => Model.add('9999-12-31', 1));
});

test('38: invisible history cannot inflate visible lanes and overlapping requirements never share a lane', () => {
  const history=Array.from({length:40},(_,i)=>({id:'old-'+i,start:'2025-01-01',end:'2025-02-01'}));
  const visible=[{id:'long',start:'2025-02-01',end:'2026-11-01'},{id:'__proto__',start:'2026-10-01',end:'2026-10-07'},{id:'later',start:'2026-10-08',end:'2026-10-31'}];
  const {mapping,count}=Model.allocateLanes([...history,...visible],'2026-09-28','2026-11-01');
  assert.equal(count,2);assert.equal(Object.keys(mapping).length,3);
  assert.notEqual(mapping.long,mapping.__proto__);
  assert.equal(mapping.__proto__,mapping.later);
  for(const a of visible)for(const b of visible)if(a!==b&&a.start<=b.end&&a.end>=b.start)assert.notEqual(mapping[a.id],mapping[b.id]);
});

test('44–45: programmer notes and long resource links survive an actual storage round trip without truncation', () => {
  const note='\n    function example() {\n\treturn 1;\n    }\n\n'+('    // review details\n'.repeat(150))+'  ';
  const url='https://example.com/design?signature='+('a'.repeat(4096))+'&page=2';
  const store=Storage.createStore(memory());
  assert.equal(store.save(snapshot([requirement({note,resources:[{name:'签名资料',type:'设计稿',url}]})])).ok,true);
  const item=store.load().data.requirements[0];
  assert.equal(item.note,note);assert.equal(item.resources[0].url,url);
  assert.throws(()=>Model.requirement(requirement({note:123})),/备忘/);
});

test('weekly lanes compact ended work while retaining usable continuation positions', () => {
  const items=[{id:'short-1',start:'2026-10-01',end:'2026-10-03'},{id:'short-2',start:'2026-10-01',end:'2026-10-03'},{id:'short-3',start:'2026-10-01',end:'2026-10-03'},{id:'long',start:'2026-10-01',end:'2026-10-31'}];
  const first=Model.allocateLanes(items,'2026-09-28','2026-10-04');
  assert.equal(first.count,4);assert.equal(first.mapping.long,0);
  const next=Model.allocateLanes(items,'2026-10-05','2026-10-11',first.mapping);
  assert.equal(next.count,1);assert.equal(next.mapping.long,0);
  const compact=Model.allocateLanes(items,'2026-10-05','2026-10-11',{long:3});
  assert.equal(compact.count,1);assert.equal(compact.mapping.long,0);
  const continuing=[{id:'a',start:'2026-10-01',end:'2026-10-20'},{id:'b',start:'2026-10-02',end:'2026-10-25'},{id:'c',start:'2026-10-03',end:'2026-10-30'}];
  const retained=Model.allocateLanes(continuing,'2026-10-05','2026-10-11',{a:1,b:2,c:3});
  assert.equal(retained.count,3);assert.equal(retained.mapping.a,1);assert.equal(retained.mapping.b,2);assert.equal(retained.mapping.c,0);
  assert.deepEqual(Model.allocateLanes([],'2026-10-05','2026-10-11'),{mapping:Object.create(null),count:0});
});

test('weekly lane allocation matches date overlap and is deterministic with arbitrary previous positions', () => {
  let seed=41;const random=max=>{seed=(seed*1664525+1013904223)>>>0;return seed%max;};
  for(let sample=0;sample<80;sample++){
    const items=Array.from({length:24},(_,i)=>{const start=random(28),length=random(14);return {id:i===0?'__proto__':'r-'+i,start:Model.add('2026-09-20',start),end:Model.add('2026-09-20',start+length)};});
    const previous=Object.fromEntries(items.map(item=>[item.id,random(30)])),start='2026-10-05',end='2026-10-11';
    const allocation=Model.allocateLanes(items,start,end,previous),visible=items.filter(item=>item.start<=end&&item.end>=start);
    const peak=Math.max(0,...Array.from({length:7},(_,day)=>{const date=Model.add(start,day);return visible.filter(item=>item.start<=date&&item.end>=date).length;}));
    assert.equal(allocation.count,peak);assert.equal(Object.keys(allocation.mapping).length,visible.length);
    assert.ok(Object.values(allocation.mapping).every(lane=>Number.isInteger(lane)&&lane>=0&&lane<peak));
    for(const a of visible)for(const b of visible)if(a!==b&&a.start<=b.end&&a.end>=b.start)assert.notEqual(allocation.mapping[a.id],allocation.mapping[b.id]);
    assert.deepEqual(Model.allocateLanes([...items].reverse(),start,end,previous),allocation);
    assert.equal(new Set(Object.values(allocation.mapping)).size,peak);
  }
});

test('moving a plan preserves duration, phase gaps, content and explicit reminder time', () => {
  const original=Model.requirement(requirement({start:'2028-02-27',end:'2028-03-08',phases:[{name:'评审',start:'2028-02-27',end:'2028-02-29'},{name:'开发',start:'2028-03-03',end:'2028-03-08'}],reminder:'2028-02-26T09:30',note:'\n    keep indentation\n\tand tabs  '}));
  const copy=JSON.stringify(original),next=Model.shiftRequirement(original,3);
  assert.equal(next.start,'2028-03-01');assert.equal(next.end,'2028-03-11');
  assert.deepEqual(next.phases,[{name:'评审',start:'2028-03-01',end:'2028-03-03'},{name:'开发',start:'2028-03-06',end:'2028-03-11'}]);
  for(const key of ['id','title','tone','resources','tasks','done','note','reminder'])assert.deepEqual(next[key],original[key]);
  assert.equal(JSON.stringify(original),copy);assert.deepEqual(Model.shiftRequirement(next,-3),original);
  assert.deepEqual(Model.shiftRequirement(original,0),original);
  assert.notEqual(next.resources,original.resources);assert.notEqual(next.phases,original.phases);
});

test('moving a plan uses whole calendar days across DST and rejects overflow atomically', () => {
  const previous=process.env.TZ;
  try{
    process.env.TZ='America/Los_Angeles';
    const original=Model.requirement(requirement({start:'2026-03-07',end:'2026-03-09',phases:[]}));
    assert.equal(Model.shiftRequirement(original,2).end,'2026-03-11');
    for(const offset of [NaN,Infinity,1.5,'2'])assert.throws(()=>Model.shiftRequirement(original,offset),/整数/);
    const lower=Model.requirement(requirement({start:'0001-01-01',end:'0001-01-03',phases:[]}));
    const upper=Model.requirement(requirement({start:'9999-12-29',end:'9999-12-31',phases:[]}));
    for(const [item,offset] of [[lower,-1],[upper,1]]){const copy=JSON.stringify(item);assert.throws(()=>Model.shiftRequirement(item,offset),/范围/);assert.equal(JSON.stringify(item),copy);}
  }finally{if(previous===undefined)delete process.env.TZ;else process.env.TZ=previous;}
});
