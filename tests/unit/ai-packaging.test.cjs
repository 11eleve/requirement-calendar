const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const {getFileMatchers,copyFiles}=require('app-builder-lib/out/fileMatcher');
const config=require('../../package.json');

test('the actual Electron Builder resource copier retains the AI SDK node_modules',async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'calendar-ai-packaging-'));
 t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const modulePath='ai-runtime/node_modules/@deepseek-ai/dsh-sdk-client/lib/index.js';
 await fs.mkdir(path.dirname(path.join(root,'.build',modulePath)),{recursive:true});
 await fs.writeFile(path.join(root,'.build',modulePath),'export class DeepSeekHarness {}');
 await fs.writeFile(path.join(root,'.build/ai-runtime/entry.mjs'),'import "@deepseek-ai/dsh-sdk-client";');
 const resource=config.build.extraResources.find(item=>item.filter?.includes('ai-runtime/**/*'));
 assert.ok(resource,'AI resources must be matched from their parent so node_modules is not treated as the app root dependency directory');
 const destination=path.join(root,'resources');
 const matchers=getFileMatchers({extraResources:[resource]},'extraResources',destination,{defaultSrc:root,globalOutDir:path.join(root,'dist'),macroExpander:value=>value,customBuildOptions:{}});
 await copyFiles(matchers);
 assert.equal(await fs.readFile(path.join(destination,modulePath),'utf8'),'export class DeepSeekHarness {}');
 assert.ok(await fs.stat(path.join(destination,'ai-runtime/entry.mjs')));
});
