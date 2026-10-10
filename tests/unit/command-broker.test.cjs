const test = require('node:test');
const assert = require('node:assert/strict');
const {EventEmitter, once} = require('node:events');
const {PassThrough} = require('node:stream');
const {CommandBroker} = require('../../desktop/electron/command-broker.cjs');

function fixture(dispatch) {
  const child = new EventEmitter();
  for (const key of ['stdin','stdout','stderr']) child[key] = new PassThrough();
  child.kill = () => child.emit('exit',1);
  const broker = new CommandBroker({executable:'reqcal.exe',directory:'C:\\data',dispatch,launch:()=>child});
  return {broker,child};
}
test('native broker frames split messages and dispatches structured data without evaluation', async () => {
  const requests = [];
  const {broker,child} = fixture(async request => { requests.push(request); return {ok:true,data:request.data}; });
  const started = broker.start();
  child.stdout.write('{"rea'); child.stdout.write('dy":true,"pipe":"fixture"}\n');
  await started;
  const reply = once(child.stdin,'data');
  const request = {action:'update',id:'login',data:{note:'中文\n$(literal) `note`'}};
  child.stdout.write(JSON.stringify({id:7,request})+'\n');
  const [raw] = await reply;
  assert.deepEqual(requests,[request]);
  assert.deepEqual(JSON.parse(raw),{id:7,response:{ok:true,data:request.data}});
  broker.stop(); assert.ok(child.stdin.writableEnded);
});
test('host errors become JSON failures while malformed helper messages stop dispatch', async () => {
  const {broker,child} = fixture(async () => { throw Error('save failed'); });
  const started = broker.start(); child.stdout.write('{"ready":true,"pipe":"fixture"}\n'); await started;
  const reply = once(child.stdin,'data');
  child.stdout.write('{"id":1,"request":{"action":"status"}}\n');
  assert.equal(JSON.parse((await reply)[0]).response.error.code,'INTERNAL_ERROR');
  const stopped = once(broker,'failure'); child.stdout.write('{"id":2,"request":[]}\n');
  assert.match((await stopped)[0].message,/退出|格式/);
});
test('a helper startup failure rejects without exposing a command endpoint', async () => {
  const {broker,child} = fixture(() => assert.fail('must not dispatch'));
  const result = broker.start(); child.emit('error',Error('missing executable'));
  await assert.rejects(result,/missing executable/);
});
