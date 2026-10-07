const test = require('node:test');
const assert = require('node:assert/strict');
const Model = require('../src/model.js');
const Storage = require('../src/storage.js');

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
  const loaded = store.load(); assert.equal(loaded.migrated, true); assert.equal(loaded.data.version, 5); assert.equal(loaded.data.requirements[0].title, '支付改版');
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
});
