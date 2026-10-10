'use strict';
// Serve only front-end inputs. Browser storage stays on a stable local origin.
const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const types = {'.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.png':'image/png'};

function createServer() {
  return http.createServer(async (request, response) => {
    try {
      const url = new URL(request.url, 'http://127.0.0.1');
      const name = decodeURIComponent(url.pathname).replace(/^\//, '') || 'index.html';
      const file = path.resolve(root, name);
      const relative = path.relative(root, file).split(path.sep).join('/');
      const allowed = relative === 'index.html' || relative === 'assets/app-icon.png' || relative.startsWith('src/');
      if (!['GET','HEAD'].includes(request.method) || !allowed || !types[path.extname(file)]) {
        response.writeHead(404); response.end(); return;
      }
      const content = await fs.readFile(file);
      response.writeHead(200, {'Content-Type': types[path.extname(file)] + '; charset=utf-8', 'Cache-Control':'no-store'});
      response.end(request.method === 'HEAD' ? undefined : content);
    } catch {
      response.writeHead(404); response.end();
    }
  });
}

if (require.main === module) {
  const server = createServer();
  server.on('error', error => { console.error(error.message); process.exitCode = 1; });
  server.listen(5173, '127.0.0.1', () => console.log('需求日历：http://127.0.0.1:5173'));
}
module.exports = {createServer};
