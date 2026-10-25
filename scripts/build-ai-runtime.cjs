const fs=require('node:fs/promises');
const path=require('node:path');
async function main(){
 const root=path.resolve(__dirname,'..'),source=path.join(root,'desktop/ai'),destination=path.resolve(process.argv.find(arg=>arg.startsWith('--output='))?.slice(9)||path.join(root,'.build/ai-runtime'));
 const [major,minor]=process.versions.node.split('.').map(Number);
 if(major<24||major===24&&minor<9)throw Error('日历助手构建需要 Node 24.9 或以上。');
 await fs.access(path.join(source,'node_modules/@deepseek-ai/dsh-sdk-client/lib/index.js')).catch(()=>{throw Error('请先运行 npm ci 安装官方 DeepSeek Harness SDK。');});
 await fs.mkdir(destination,{recursive:true});
 for(const file of await fs.readdir(source)){if(file==='node_modules'||file.endsWith('.mjs')||file==='package.json')await fs.cp(path.join(source,file),path.join(destination,file),{recursive:true,verbatimSymlinks:true});}
 if(process.argv.includes('--node')){
  await fs.copyFile(process.execPath,path.join(destination,'node'));await fs.chmod(path.join(destination,'node'),0o755);
  const license=await fetch('https://raw.githubusercontent.com/nodejs/node/v'+process.versions.node+'/LICENSE');
  if(!license.ok)throw Error('无法获取随包 Node 运行时的许可证。');await fs.writeFile(path.join(destination,'NODE-LICENSE.txt'),await license.text());
 }
 const manifests=[];
 async function scan(directory){for(const entry of await fs.readdir(directory,{withFileTypes:true})){if(!entry.isDirectory())continue;const current=path.join(directory,entry.name);if(entry.name.startsWith('@'))await scan(current);else{try{const p=JSON.parse(await fs.readFile(path.join(current,'package.json'),'utf8'));manifests.push(p.name+' '+p.version+' — '+(typeof p.license==='string'?p.license:JSON.stringify(p.license??'See package license')));}catch{};try{await scan(path.join(current,'node_modules'));}catch{}}}}
 await scan(path.join(destination,'node_modules'));
 await fs.writeFile(path.join(destination,'DEPENDENCIES.txt'),'DeepSeek Harness and transitive dependencies. License files are retained beside each package.\n\n'+manifests.sort().join('\n')+'\n');
 console.log('Prepared AI runtime: '+destination);
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
