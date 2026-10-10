const {execFileSync} = require('node:child_process');
const path = require('node:path');
if (process.platform === 'win32') {
  execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',path.join(__dirname,'build-cli-windows.ps1')],{stdio:'inherit',windowsHide:true});
}
