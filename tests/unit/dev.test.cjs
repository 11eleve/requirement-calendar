const test = require('node:test');
const assert = require('node:assert/strict');
const {createServer} = require('../../scripts/dev.cjs');

test('development entry and nested scripts load while repository internals stay private', async t => {
  const server = createServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const origin = 'http://127.0.0.1:' + server.address().port;
  const entry = await fetch(origin);
  assert.equal(entry.status, 200);
  assert.match(await entry.text(), /src\/main\.js/);
  for (const name of ['/src/domain/model.js', '/src/styles/main.css']) {
    assert.equal((await fetch(origin + name)).status, 200);
  }
  for (const name of ['/.git/config', '/package.json', '/desktop/macos/App.swift', '/src/%2e%2e/package.json']) {
    assert.equal((await fetch(origin + name)).status, 404);
  }
});
