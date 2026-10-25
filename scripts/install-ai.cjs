const {execFileSync}=require('node:child_process');
const path=require('node:path');
if(!process.env.npm_execpath)throw Error('请通过 npm ci 安装日历助手依赖。');
execFileSync(process.execPath,[process.env.npm_execpath,'ci','--prefix',path.join(__dirname,'../desktop/ai'),'--ignore-scripts','--no-audit','--no-fund'],{stdio:'inherit',env:process.env});
