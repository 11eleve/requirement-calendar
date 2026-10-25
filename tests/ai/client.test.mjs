import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {once} from 'node:events';
import {fileURLToPath} from 'node:url';
import Client from '../../desktop/electron/ai-client.cjs';

test('a corrupt encrypted key remains recoverable through settings without exposing plaintext',async t=>{
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'calendar-ai-key-'));
 await fs.writeFile(path.join(directory,'key.enc'),'corrupt');
 const client=new Client.AIClient({directory,entry:fileURLToPath(new URL('../../desktop/ai/entry.mjs',import.meta.url)),dispatch:async()=>({ok:true,revision:'0',data:{}}),vault:{decrypt(){throw Error('bad sealed data');},encrypt(){return Buffer.from('sealed-fixture');}}});
 t.after(async()=>{if(client.child){const exited=once(client.child,'exit');client.stop();await exited;}await fs.rm(directory,{recursive:true,force:true});});
 const state=await client.request({method:'state'});assert.equal(state.hasKey,false);assert.match(state.keyIssue,/重新保存/);
 const updated=await client.request({method:'configure',settings:state.settings,apiKey:'replacement-fixture'});
 assert.equal(updated.hasKey,true);assert.equal(updated.keyIssue,null);
 assert.equal(await fs.readFile(path.join(directory,'key.enc'),'utf8'),'sealed-fixture');
 assert.ok(!(await fs.readFile(path.join(directory,'settings.json'),'utf8')).includes('replacement-fixture'));
});
